import * as cheerio from "cheerio";
import { amazonDiscover, type OfferCandidate } from "@/lib/adapters";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError, titleMatchScore } from "./http";

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

interface AmazonHit {
  asin: string;
  title: string;
  url: string;
  price: number | null;
  imageUrl?: string;
  score: number;
}

function stubFromProduct(product: SearchResult): OfferCandidate {
  return amazonDiscover(product);
}

function isBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes("captcha") ||
    lower.includes("robot check") ||
    lower.includes("api-services-support@amazon.com") ||
    html.length < 3_000
  );
}

function parseAmazonSearchHits(html: string, query: string): AmazonHit[] {
  const $ = cheerio.load(html);
  const hits: AmazonHit[] = [];
  const modelTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => /^[a-z]*\d+[a-z]*$/i.test(t));

  $("div[data-component-type='s-search-result'][data-asin]").each((_, el) => {
    const root = $(el);
    const asin = (root.attr("data-asin") ?? "").trim();
    if (!asin) return;

    const title =
      root.find("h2 a span").first().text().trim() ||
      root.find("h2 span").first().text().trim() ||
      root.find("a.a-link-normal.s-line-clamp-2 span").first().text().trim() ||
      root.find("img.s-image").attr("alt")?.trim() ||
      "";
    if (!title) return;

    // Hard require model tokens (e.g. H2S) so P2S cannot win an H2S query.
    const titleLower = title.toLowerCase();
    if (modelTokens.length && !modelTokens.every((t) => titleLower.includes(t))) {
      return;
    }

    const href = root.find("h2 a").first().attr("href");
    const productUrl = href
      ? href.startsWith("http")
        ? href.split("?")[0]
        : `https://www.amazon.com${href.split("?")[0]}`
      : `https://www.amazon.com/dp/${asin}`;

    const priceText =
      root.find("span.a-price span.a-offscreen").first().text() ||
      root.find("span.a-price-whole").first().text();
    const price = parseMoney(priceText);
    const imageUrl = root.find("img.s-image").attr("src") || undefined;

    hits.push({
      asin,
      title,
      url: productUrl,
      price,
      imageUrl,
      score: titleMatchScore(query, title),
    });
  });

  // Fallback: aria-label cards when classic result markup is sparse
  if (hits.length === 0) {
    $("a[aria-label]").each((_, el) => {
      const title = ($(el).attr("aria-label") ?? "").trim();
      if (title.length < 8) return;
      const titleLower = title.toLowerCase();
      if (modelTokens.length && !modelTokens.every((t) => titleLower.includes(t))) {
        return;
      }
      const href = $(el).attr("href") ?? "";
      const asinMatch = href.match(/\/dp\/([A-Z0-9]{10})/i);
      if (!asinMatch) return;
      hits.push({
        asin: asinMatch[1],
        title,
        url: `https://www.amazon.com/dp/${asinMatch[1]}`,
        price: null,
        score: titleMatchScore(query, title),
      });
    });
  }

  return hits.sort((a, b) => b.score - a.score);
}

export async function searchAmazonAsCatalog(
  query: string,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
  const { html } = await fetchHtml(url, { timeoutMs: 10_000, minIntervalMs: 2_500 });
  if (isBlocked(html)) throw new ScrapeError("Amazon search blocked");

  const hits = parseAmazonSearchHits(html, q).filter(
    (h) => h.score >= 8 && (h.price == null || h.price >= 80),
  );
  return hits.slice(0, 10).map((h, index) => ({
    id: `amz-${h.asin}-${index}`,
    title: h.title,
    brand: q.split(/\s+/)[0],
    imageUrl:
      h.imageUrl ||
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: h.price ?? 0,
    currency: "USD",
    merchantHint: "Amazon.com",
    sourceHint: "amazon" as const,
  }));
}

/**
 * User-triggered Amazon search page parse — restrained, rate-limited via fetchHtml.
 * Picks the best title match (not merely the first sponsored/accessory row).
 */
export async function discoverAmazonOffer(
  product: SearchResult,
): Promise<DiscoverResult> {
  const stub = stubFromProduct(product);
  try {
    const queries = [
      product.title,
      `${product.title} 3D Printer`,
      product.brand ? `${product.brand} ${product.title}` : null,
    ].filter((q, i, arr): q is string => Boolean(q) && arr.indexOf(q) === i);

    let best: AmazonHit | null = null;
    for (const q of queries) {
      const url = `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;
      const { html } = await fetchHtml(url, {
        timeoutMs: 10_000,
        minIntervalMs: 2_500,
      });
      if (isBlocked(html)) continue;
      const hits = parseAmazonSearchHits(html, product.title);
      const candidate = hits[0];
      if (candidate && (!best || candidate.score > best.score)) {
        best = candidate;
      }
      // Good enough exact-ish match
      if (best && best.score >= 15) break;
    }

    if (!best || best.score < 8) {
      throw new ScrapeError("No strong Amazon title match");
    }

    return {
      candidate: {
        sourceId: "amazon",
        title: best.title,
        url: best.url,
        merchant: "Amazon.com",
        currency: product.currency || "USD",
        price: best.price ?? stub.price,
        suspect: best.score < 18,
      },
      mode: "scrape",
      note: `Parsed Amazon search hit (score ${best.score}).`,
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
    const { html } = await fetchHtml(url, { timeoutMs: 10_000, minIntervalMs: 2_500 });
    if (isBlocked(html)) throw new ScrapeError("Amazon product page blocked");
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
