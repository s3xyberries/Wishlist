import * as cheerio from "cheerio";
import type { OfferCandidate } from "@/lib/adapters";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface DiscoverResult {
  candidate: OfferCandidate | null;
  mode: "scrape" | "none";
  note: string;
}

/** Known brand PDPs we can scrape when marketplace search is blocked. */
const OFFICIAL_PRODUCTS: Array<{
  id: string;
  brand: string;
  match: RegExp;
  url: string;
}> = [
  {
    id: "bambu-h2s",
    brand: "Bambu Lab",
    match: /bambu.*\bh2s\b|\bh2s\b.*bambu|\bh2s\b.*3d\s*printer/i,
    url: "https://us.store.bambulab.com/products/h2s",
  },
  {
    id: "bambu-h2d",
    brand: "Bambu Lab",
    match: /bambu.*\bh2d\b|\bh2d\b.*bambu/i,
    url: "https://us.store.bambulab.com/products/h2d",
  },
  {
    id: "bambu-x1c",
    brand: "Bambu Lab",
    match: /bambu.*\bx1[\s-]?c(arbon)?\b|\bx1[\s-]?carbon\b/i,
    url: "https://us.store.bambulab.com/products/x1-carbon",
  },
];

function officialUrlFor(product: SearchResult): string | null {
  const hay = `${product.title} ${product.brand ?? ""}`.toLowerCase();
  const hit = OFFICIAL_PRODUCTS.find((p) => p.match.test(hay));
  return hit?.url ?? null;
}

async function scrapeOfficialPdp(
  entry: (typeof OFFICIAL_PRODUCTS)[number],
): Promise<SearchResult | null> {
  const { html } = await fetchHtml(entry.url, {
    timeoutMs: 12_000,
    minIntervalMs: 2_000,
  });
  if (html.length < 2_000 || /just a moment|cf-browser-verification/i.test(html)) {
    return null;
  }
  const ld = parseJsonLdProduct(html);
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

  return {
    id: `official-${entry.id}`,
    title,
    brand: entry.brand,
    imageUrl: image,
    priceSnippet: price,
    currency: ld?.currency || "USD",
    merchantHint: `${entry.brand} official store`,
    sourceHint: "shopping",
  };
}

/** Live-scrape mapped official brand stores for the query. */
export async function searchOfficialStores(
  query: string,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const matches = OFFICIAL_PRODUCTS.filter((p) => p.match.test(q));
  if (!matches.length) return [];

  const settled = await Promise.all(
    matches.map(async (entry) => {
      try {
        return await scrapeOfficialPdp(entry);
      } catch {
        return null;
      }
    }),
  );
  return settled.filter((r): r is SearchResult => r != null);
}

function parseJsonLdProduct(
  html: string,
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
      let currency = "USD";
      const offers = obj.offers as Record<string, unknown> | undefined;
      if (offers) {
        price = parseMoney(String(offers.price ?? offers.lowPrice ?? "")) ?? undefined;
        currency = String(offers.priceCurrency ?? "USD");
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
): Promise<DiscoverResult> {
  const official = officialUrlFor(product);
  if (!official) {
    return {
      candidate: null,
      mode: "none",
      note: "No official store mapping for this product.",
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
    const ld = parseJsonLdProduct(html);
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
        merchant: "Official store",
        currency: ld?.currency || product.currency || "USD",
        price,
        suspect: false,
      },
      mode: "scrape",
      note: "Parsed official brand store product page.",
    };
  } catch {
    return {
      candidate: null,
      mode: "none",
      note: "Official store scrape failed.",
    };
  }
}

export async function fetchOfficialOrGenericPrice(
  url: string,
  currency = "USD",
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
    const ld = parseJsonLdProduct(html);
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
