import * as cheerio from "cheerio";
import { searchMockCatalog } from "@/lib/mock-catalog";
import type { SearchResult } from "@/lib/types";
import { searchAmazonAsCatalog } from "./amazon";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export type SearchMode =
  | "serpapi"
  | "scrape"
  | "amazon-scrape"
  | "mock"
  | "scrape-fallback-mock"
  | "serpapi-fallback-mock";

export interface SearchResponse {
  results: SearchResult[];
  mode: SearchMode;
  note: string;
}

function hasSerpApiKey() {
  return Boolean(
    process.env.SERPAPI_API_KEY ||
      process.env.GOOGLE_SHOPPING_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_SHOPPING_API_KEY,
  );
}

function serpKey(): string | undefined {
  return (
    process.env.SERPAPI_API_KEY ||
    process.env.GOOGLE_SHOPPING_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_SHOPPING_API_KEY ||
    undefined
  );
}

function mapSerpResult(item: Record<string, unknown>, index: number): SearchResult | null {
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const price =
    parseMoney(String(item.extracted_price ?? item.price ?? "")) ??
    (typeof item.extracted_price === "number" ? item.extracted_price : null);
  const thumbnail = String(item.thumbnail ?? item.image ?? "");
  const source = String(item.source ?? item.merchant ?? "Google Shopping");
  return {
    id: `serp-${index}-${Buffer.from(title).toString("base64url").slice(0, 12)}`,
    title,
    brand: typeof item.brand === "string" ? item.brand : undefined,
    imageUrl:
      thumbnail ||
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: price ?? 0,
    currency: "USD",
    merchantHint: source,
    sourceHint: "shopping",
    rating: typeof item.rating === "number" ? item.rating : undefined,
    reviewCount:
      typeof item.reviews === "number"
        ? item.reviews
        : typeof item.reviews === "string"
          ? Number.parseInt(item.reviews, 10) || undefined
          : undefined,
  };
}

async function searchViaSerpApi(query: string): Promise<SearchResult[]> {
  const key = serpKey();
  if (!key) throw new ScrapeError("No SerpAPI key");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("api_key", key);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw new ScrapeError(`SerpAPI HTTP ${res.status}`, res.status);
  }
  const data = (await res.json()) as {
    shopping_results?: Record<string, unknown>[];
    error?: string;
  };
  if (data.error) throw new ScrapeError(data.error);
  const rows = data.shopping_results ?? [];
  return rows
    .map((row, i) => mapSerpResult(row, i))
    .filter((r): r is SearchResult => r !== null)
    .slice(0, 12);
}

async function searchViaHtmlScrape(query: string): Promise<SearchResult[]> {
  const url = `https://www.google.com/search?tbm=shop&hl=en&gl=us&q=${encodeURIComponent(query)}`;
  const { html } = await fetchHtml(url, { timeoutMs: 7_000, minIntervalMs: 3_000 });

  const lower = html.toLowerCase();
  if (
    lower.includes("captcha") ||
    lower.includes("unusual traffic") ||
    lower.includes("consent.google") ||
    html.length < 2_000
  ) {
    throw new ScrapeError("Google Shopping HTML blocked or incomplete");
  }

  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const cards = $(
    "div.sh-dgr__grid-result, div.sh-dgr__content, div[data-docid], div.i0X6kf, div.u30d4",
  );

  cards.each((index, el) => {
    if (results.length >= 10) return;
    const root = $(el);
    const title =
      root.find("h3, h4, a[aria-label]").first().text().trim() ||
      root.find("a").first().attr("aria-label")?.trim() ||
      "";
    if (!title || title.length < 4) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);

    const priceText =
      root.find("span.a8Pemb, span[aria-label*='$'], span.HRLxBb, b").first().text() ||
      root.text().match(/\$[\d,.]+/)?.[0] ||
      "";
    const price = parseMoney(priceText) ?? 0;
    const merchant =
      root.find("div.aULzUe, span.IuHnof, div.O8U6h").first().text().trim() ||
      "Google Shopping";
    const img =
      root.find("img").first().attr("src") ||
      root.find("img").first().attr("data-src") ||
      "";

    results.push({
      id: `ghtml-${index}-${Buffer.from(title).toString("base64url").slice(0, 12)}`,
      title,
      imageUrl:
        img.startsWith("http")
          ? img
          : "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80",
      priceSnippet: price,
      currency: "USD",
      merchantHint: merchant.slice(0, 80) || "Google Shopping",
      sourceHint: "shopping",
    });
  });

  if (results.length === 0) {
    throw new ScrapeError("No product cards parsed from Google Shopping HTML");
  }
  return results;
}

function mergeUnique(...lists: SearchResult[][]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.title.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export async function searchProducts(query: string): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) {
    return { results: [], mode: "mock", note: "Empty query." };
  }

  // Prefer curated mock matches first so known SKUs (e.g. Bambu H2S) surface
  // even when marketplaces only return accessories.
  const mock = searchMockCatalog(q);

  if (hasSerpApiKey()) {
    try {
      const results = await searchViaSerpApi(q);
      if (results.length) {
        return {
          results: mergeUnique(mock, results),
          mode: "serpapi",
          note: "Live Google Shopping via SerpAPI.",
        };
      }
    } catch {
      // fall through
    }
  }

  try {
    const results = await searchViaHtmlScrape(q);
    return {
      results: mergeUnique(mock, results),
      mode: "scrape",
      note: "Best-effort Google Shopping HTML scrape (user-initiated).",
    };
  } catch {
    // Google often blocks cloud IPs — fall through to Amazon marketplace search.
  }

  try {
    const results = await searchAmazonAsCatalog(q);
    if (results.length || mock.length) {
      return {
        results: mergeUnique(mock, results),
        mode: results.length ? "amazon-scrape" : "mock",
        note: results.length
          ? "Google Shopping unavailable — used Amazon search scrape (mock matches first)."
          : "Live scrapes unavailable — mock catalog match.",
      };
    }
  } catch {
    // fall through to mock
  }

  return {
    results: mock,
    mode: mock.length ? "mock" : "scrape-fallback-mock",
    note: mock.length
      ? "Live scrapes unavailable — mock catalog match."
      : "Live scrape blocked and no mock match.",
  };
}
