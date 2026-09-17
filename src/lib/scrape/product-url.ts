import * as cheerio from "cheerio";
import type { RegionConfig } from "@/lib/region/config";
import { getRegion } from "@/lib/region/config";
import type { SourceId } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface ScrapedProductPage {
  title: string;
  price: number;
  currency: string;
  imageUrl: string;
  url: string;
  merchant: string;
  sourceId: SourceId;
  brand?: string;
  mode: "scrape";
  note: string;
}

function inferSourceId(hostname: string): SourceId {
  const host = hostname.toLowerCase();
  if (host.includes("amazon.")) return "amazon";
  if (host.includes("ebay.")) return "ebay";
  return "generic";
}

function merchantFromHost(hostname: string, region: RegionConfig): string {
  const host = hostname.replace(/^www\./, "");
  if (host.includes("amazon.")) return region.amazonMerchantLabel;
  if (host.includes("ebay.")) return `eBay (${region.shortLabel})`;
  if (host.includes("bambulab")) return `Bambu Lab store (${region.shortLabel})`;
  return host;
}

function parseJsonLdProduct(
  html: string,
  fallbackCurrency: string,
): {
  name?: string;
  price?: number;
  currency?: string;
  image?: string;
  url?: string;
  brand?: string;
} | null {
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
        price =
          parseMoney(String(offers.price ?? offers.lowPrice ?? "")) ?? undefined;
        currency = String(offers.priceCurrency ?? fallbackCurrency);
      }
      const variants = obj.hasVariant as Array<Record<string, unknown>> | undefined;
      if ((!price || price <= 0) && Array.isArray(variants)) {
        for (const v of variants) {
          const vo = v.offers as Record<string, unknown> | undefined;
          const p = parseMoney(String(vo?.price ?? ""));
          if (p != null && p > 20) {
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
      let brand: string | undefined;
      if (typeof obj.brand === "string") brand = obj.brand;
      else if (obj.brand && typeof obj.brand === "object") {
        const b = obj.brand as { name?: string };
        if (b.name) brand = b.name;
      }
      return {
        name: typeof obj.name === "string" ? obj.name : undefined,
        price,
        currency,
        image: imageUrl,
        url: typeof obj.url === "string" ? obj.url : undefined,
        brand,
      };
    }
  }
  return null;
}

export function validateProductUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new ScrapeError("URL is required");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ScrapeError("Enter a valid http(s) product URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ScrapeError("URL must start with http:// or https://");
  }
  if (!parsed.hostname || parsed.hostname === "localhost") {
    throw new ScrapeError("Enter a public product page URL");
  }
  return parsed;
}

/**
 * Scrape an arbitrary product URL for title + price (JSON-LD / meta / common selectors).
 */
export async function scrapeProductUrl(
  rawUrl: string,
  region: RegionConfig = getRegion("au"),
): Promise<ScrapedProductPage> {
  const parsed = validateProductUrl(rawUrl);
  const canonical = parsed.toString();
  const sourceId = inferSourceId(parsed.hostname);

  const { html } = await fetchHtml(canonical, {
    timeoutMs: 14_000,
    minIntervalMs: 2_000,
  });
  if (
    html.length < 1_500 ||
    /just a moment|cf-browser-verification|captcha|robot check/i.test(html)
  ) {
    throw new ScrapeError("Could not load that page (blocked or empty)");
  }

  const ld = parseJsonLdProduct(html, region.currency);
  const $ = cheerio.load(html);

  const metaPrice = parseMoney(
    $('meta[property="product:price:amount"]').attr("content") ||
      $('meta[property="og:price:amount"]').attr("content") ||
      $('meta[itemprop="price"]').attr("content"),
  );
  const amazonPrice = parseMoney(
    $("#corePrice_feature_div span.a-offscreen").first().text() ||
      $("span.a-price span.a-offscreen").first().text(),
  );
  const ebayPrice = parseMoney(
    $("div.x-price-primary span").first().text() || $("#prcIsum").text(),
  );
  const bodyMatch = html.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
  const bodyPrice = bodyMatch ? parseMoney(bodyMatch[0]) : null;

  const price =
    (ld?.price && ld.price > 0 ? ld.price : null) ??
    metaPrice ??
    amazonPrice ??
    ebayPrice ??
    (bodyPrice && bodyPrice > 5 ? bodyPrice : null);

  if (price == null) {
    throw new ScrapeError("No price found on that page");
  }

  const title =
    ld?.name ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    $("#productTitle").text().trim() ||
    $("title").first().text().trim() ||
    "";
  if (!title || title.length < 2) {
    throw new ScrapeError("No product title found on that page");
  }

  const image =
    ld?.image ||
    $('meta[property="og:image"]').attr("content") ||
    $("#landingImage").attr("src") ||
    "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80";

  const currency =
    ld?.currency ||
    $('meta[property="product:price:currency"]').attr("content") ||
    region.currency;

  return {
    title: title.replace(/\s+/g, " ").slice(0, 240),
    price,
    currency,
    imageUrl: image.startsWith("//") ? `https:${image}` : image,
    url: ld?.url || canonical,
    merchant: merchantFromHost(parsed.hostname, region),
    sourceId,
    brand: ld?.brand,
    mode: "scrape",
    note: `Scraped ${parsed.hostname} via JSON-LD/meta/selectors.`,
  };
}
