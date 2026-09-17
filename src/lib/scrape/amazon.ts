import * as cheerio from "cheerio";
import {
  amazonDiscover,
  type OfferCandidate,
} from "@/lib/adapters";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface DiscoverResult {
  candidate: OfferCandidate;
  mode: "scrape" | "stub";
  note: string;
}

export interface PriceFetchResult {
  price: number;
  currency: string;
  title?: string;
  mode: "scrape" | "stub";
  note: string;
}

function stubFromProduct(product: SearchResult): OfferCandidate {
  return amazonDiscover(product);
}

/**
 * User-triggered Amazon search page parse — restrained, rate-limited via fetchHtml.
 * Falls back to stub adapter on block/parse failure.
 */
export async function discoverAmazonOffer(
  product: SearchResult,
): Promise<DiscoverResult> {
  const stub = stubFromProduct(product);
  try {
    const url = `https://www.amazon.com/s?k=${encodeURIComponent(product.title)}`;
    const { html } = await fetchHtml(url, { timeoutMs: 8_000, minIntervalMs: 3_000 });
    const lower = html.toLowerCase();
    if (
      lower.includes("captcha") ||
      lower.includes("robot check") ||
      lower.includes("api-services-support@amazon.com") ||
      html.length < 3_000
    ) {
      throw new ScrapeError("Amazon search blocked");
    }

    const $ = cheerio.load(html);
    const first = $(
      "div[data-component-type='s-search-result'][data-asin]:not([data-asin=''])",
    ).first();
    if (!first.length) throw new ScrapeError("No Amazon search results");

    const asin = first.attr("data-asin") ?? "";
    const title =
      first.find("h2 a span").first().text().trim() ||
      first.find("h2 span").first().text().trim() ||
      product.title;
    const href = first.find("h2 a").first().attr("href");
    const productUrl = href
      ? href.startsWith("http")
        ? href.split("?")[0]
        : `https://www.amazon.com${href.split("?")[0]}`
      : asin
        ? `https://www.amazon.com/dp/${asin}`
        : stub.url;

    const priceText =
      first.find("span.a-price span.a-offscreen").first().text() ||
      first.find("span.a-price-whole").first().text();
    const price = parseMoney(priceText) ?? stub.price;

    return {
      candidate: {
        sourceId: "amazon",
        title,
        url: productUrl,
        merchant: "Amazon.com",
        currency: product.currency || "USD",
        price,
      },
      mode: "scrape",
      note: "Parsed top Amazon search hit.",
    };
  } catch {
    return {
      candidate: stub,
      mode: "stub",
      note: "Amazon scrape blocked/failed — stub adapter.",
    };
  }
}

export async function fetchAmazonPrice(
  url: string,
  fallbackPrice: number,
  currency = "USD",
): Promise<PriceFetchResult> {
  try {
    const { html } = await fetchHtml(url, { timeoutMs: 8_000, minIntervalMs: 3_000 });
    const lower = html.toLowerCase();
    if (lower.includes("captcha") || lower.includes("robot check")) {
      throw new ScrapeError("Amazon product page blocked");
    }
    const $ = cheerio.load(html);
    const title =
      $("#productTitle").text().trim() ||
      $("span#title").text().trim() ||
      undefined;
    const priceText =
      $("#corePrice_feature_div span.a-offscreen").first().text() ||
      $("#priceblock_ourprice").text() ||
      $("#priceblock_dealprice").text() ||
      $("span.a-price span.a-offscreen").first().text() ||
      $("meta[itemprop='price']").attr("content") ||
      "";
    const price = parseMoney(priceText);
    if (price == null) throw new ScrapeError("No price on Amazon page");
    return {
      price,
      currency,
      title,
      mode: "scrape",
      note: "Parsed Amazon product price.",
    };
  } catch {
    return {
      price: fallbackPrice,
      currency,
      mode: "stub",
      note: "Amazon price scrape failed — kept previous/stub price.",
    };
  }
}
