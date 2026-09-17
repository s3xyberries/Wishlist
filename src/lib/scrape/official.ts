import * as cheerio from "cheerio";
import { genericDiscover, type OfferCandidate } from "@/lib/adapters";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface DiscoverResult {
  candidate: OfferCandidate;
  mode: "scrape" | "stub";
  note: string;
}

/** Known official PDP patterns for products the mock/live search often miss. */
function officialUrlFor(product: SearchResult): string | null {
  const hay = `${product.title} ${product.brand ?? ""}`.toLowerCase();
  if (/bambu/.test(hay) && /\bh2s\b/.test(hay)) {
    return "https://us.store.bambulab.com/products/h2s";
  }
  if (/bambu/.test(hay) && /\bh2d\b/.test(hay)) {
    return "https://us.store.bambulab.com/products/h2d";
  }
  if (/bambu/.test(hay) && /\bx1c\b|\bx1-carbon\b/.test(hay)) {
    return "https://us.store.bambulab.com/products/x1-carbon";
  }
  return null;
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
      // ignore bad json-ld
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
      // ProductGroup variants
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

/**
 * Prefer official brand PDP when we recognize the product; else generic stub.
 */
export async function discoverGenericOffer(
  product: SearchResult,
): Promise<DiscoverResult> {
  const stub = genericDiscover(product);
  const official = officialUrlFor(product);
  if (!official) {
    return {
      candidate: stub,
      mode: "stub",
      note: "No official store mapping — generic stub URL.",
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
    const ogPrice =
      parseMoney($('meta[property="product:price:amount"]').attr("content")) ||
      parseMoney(html.match(/\$\s?([\d,]+\.\d{2})/)?.[0] ?? null);
    const price = ld?.price && ld.price > 50 ? ld.price : ogPrice ?? stub.price;
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
        price: price ?? stub.price,
        suspect: false,
      },
      mode: "scrape",
      note: "Parsed official brand store product page.",
    };
  } catch {
    return {
      candidate: {
        ...stub,
        title: product.title,
        url: official,
        merchant: "Official store",
        suspect: false,
        price: stub.price,
      },
      mode: "stub",
      note: "Official URL known but live parse failed — kept URL with stub price.",
    };
  }
}

export async function fetchOfficialOrGenericPrice(
  url: string,
  fallbackPrice: number,
  currency = "USD",
): Promise<{
  price: number;
  currency: string;
  title?: string;
  mode: "scrape" | "stub";
  note: string;
}> {
  try {
    const host = new URL(url).hostname;
    if (!host || host.endsWith("example-retailer.example")) {
      throw new ScrapeError("Stub generic host");
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
      price: fallbackPrice,
      currency,
      mode: "stub",
      note: "Generic URL price scrape failed — kept previous price.",
    };
  }
}
