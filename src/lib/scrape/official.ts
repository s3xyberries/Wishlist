import * as cheerio from "cheerio";
import type { OfferCandidate } from "@/lib/adapters";
import type { RegionConfig } from "@/lib/region/config";
import { getRegion } from "@/lib/region/config";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface DiscoverResult {
  candidate: OfferCandidate | null;
  mode: "scrape" | "none";
  note: string;
}

function officialProductsFor(region: RegionConfig) {
  return region.officialProducts;
}

function officialUrlFor(
  product: SearchResult,
  region: RegionConfig,
): string | null {
  const hay = `${product.title} ${product.brand ?? ""}`.toLowerCase();
  const hit = officialProductsFor(region).find((p) => p.match.test(hay));
  return hit?.url ?? null;
}

async function scrapeOfficialPdp(
  entry: RegionConfig["officialProducts"][number],
  region: RegionConfig,
): Promise<SearchResult | null> {
  const { html } = await fetchHtml(entry.url, {
    timeoutMs: 12_000,
    minIntervalMs: 2_000,
  });
  if (html.length < 2_000 || /just a moment|cf-browser-verification/i.test(html)) {
    return null;
  }
  const ld = parseJsonLdProduct(html, region.currency);
  const $ = cheerio.load(html);
  const ogPrice = parseMoney(
    $('meta[property="product:price:amount"]').attr("content"),
  );
  const price = ld?.price && ld.price > 50 ? ld.price : ogPrice;
  if (price == null) return null;
  const title =
    ld?.name ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    `${entry.brand} product`;
  const image =
    ld?.image ||
    $('meta[property="og:image"]').attr("content") ||
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80";

  // Prefer region currency for regional official stores (Shopify often emits USD).
  const currency = region.currency;

  return {
    id: `official-${region.id}-${entry.id}`,
    title,
    brand: entry.brand,
    imageUrl: image,
    priceSnippet: price,
    currency,
    merchantHint: `${entry.brand} official store (${region.shortLabel})`,
    sourceHint: "shopping",
    productUrl: entry.url,
  };
}

/** Live-scrape mapped official brand stores for the query + region. */
export async function searchOfficialStores(
  query: string,
  region: RegionConfig = getRegion("au"),
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const matches = officialProductsFor(region).filter((p) => p.match.test(q));
  if (!matches.length) return [];

  const settled = await Promise.all(
    matches.map(async (entry) => {
      try {
        return await scrapeOfficialPdp(entry, region);
      } catch {
        return null;
      }
    }),
  );
  return settled.filter((r): r is SearchResult => r != null);
}

function parseJsonLdProduct(
  html: string,
  fallbackCurrency: string,
): { name?: string; price?: number; currency?: string; image?: string; url?: string } | null {
  const $ = cheerio.load(html);
  const blocks: unknown[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // ignore
    }
  });

  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const obj = block as Record<string, unknown>;
    const type = obj["@type"];
    const types = Array.isArray(type) ? type : [type];

    if (types.includes("Product") || types.includes("ProductGroup")) {
      let price: number | undefined;
      let currency = fallbackCurrency;
      const offers = obj.offers as Record<string, unknown> | undefined;
      if (offers) {
        price = parseMoney(String(offers.price ?? offers.lowPrice ?? "")) ?? undefined;
        currency = String(offers.priceCurrency ?? fallbackCurrency);
      }
      const variants = obj.hasVariant as Array<Record<string, unknown>> | undefined;
      if ((!price || price <= 0) && Array.isArray(variants)) {
        for (const v of variants) {
          const vo = v.offers as Record<string, unknown> | undefined;
          const p = parseMoney(String(vo?.price ?? ""));
          if (p != null && p > 50) {
            price = p;
            currency = String(vo?.priceCurrency ?? currency);
            break;
          }
        }
      }
      const image = obj.image;
      const imageUrl = Array.isArray(image)
        ? String(image[0])
        : typeof image === "string"
          ? image
          : undefined;
      return {
        name: typeof obj.name === "string" ? obj.name : undefined,
        price,
        currency,
        image: imageUrl,
        url: typeof obj.url === "string" ? obj.url : undefined,
      };
    }
  }
  return null;
}

export async function discoverGenericOffer(
  product: SearchResult,
  region: RegionConfig = getRegion("au"),
): Promise<DiscoverResult> {
  const official = officialUrlFor(product, region);
  if (!official) {
    return {
      candidate: null,
      mode: "none",
      note: `No ${region.shortLabel} official store mapping for this product.`,
    };
  }

  try {
    const { html } = await fetchHtml(official, {
      timeoutMs: 12_000,
      minIntervalMs: 2_000,
    });
    if (html.length < 2_000 || /just a moment|cf-browser-verification/i.test(html)) {
      throw new ScrapeError("Official store blocked");
    }
    const ld = parseJsonLdProduct(html, region.currency);
    const $ = cheerio.load(html);
    const ogPrice = parseMoney(
      $('meta[property="product:price:amount"]').attr("content"),
    );
    const price = ld?.price && ld.price > 50 ? ld.price : ogPrice;
    if (price == null) throw new ScrapeError("Official store missing price");
    const title =
      ld?.name ||
      $('meta[property="og:title"]').attr("content")?.trim() ||
      product.title;

    return {
      candidate: {
        sourceId: "generic",
        title,
        url: ld?.url || official,
        merchant: `Official store (${region.shortLabel})`,
        currency: ld?.currency || product.currency || region.currency,
        price,
        suspect: false,
      },
      mode: "scrape",
      note: `Parsed ${region.shortLabel} official brand store product page.`,
    };
  } catch {
    return {
      candidate: null,
      mode: "none",
      note: `${region.shortLabel} official store scrape failed.`,
    };
  }
}

export async function fetchOfficialOrGenericPrice(
  url: string,
  currency = "AUD",
): Promise<{
  price: number | null;
  currency: string;
  title?: string;
  mode: "scrape" | "none";
  note: string;
}> {
  try {
    const host = new URL(url).hostname;
    if (!host || host.endsWith("example-retailer.example")) {
      throw new ScrapeError("Invalid host");
    }
    const { html } = await fetchHtml(url, {
      timeoutMs: 12_000,
      minIntervalMs: 2_000,
    });
    if (html.length < 2_000 || /just a moment|cf-browser-verification/i.test(html)) {
      throw new ScrapeError("Store page blocked");
    }
    const ld = parseJsonLdProduct(html, currency);
    const $ = cheerio.load(html);
    const metaPrice = parseMoney(
      $('meta[property="product:price:amount"]').attr("content"),
    );
    const price =
      (ld?.price && ld.price > 20 ? ld.price : null) ?? metaPrice ?? null;
    if (price == null) throw new ScrapeError("No price on generic page");
    return {
      price,
      currency: ld?.currency || currency,
      title: ld?.name,
      mode: "scrape",
      note: "Parsed product page price (JSON-LD/meta).",
    };
  } catch {
    return {
      price: null,
      currency,
      mode: "none",
      note: "Generic URL price scrape failed.",
    };
  }
}
