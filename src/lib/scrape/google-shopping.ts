import * as cheerio from "cheerio";
import { searchAmazonAsCatalog } from "./amazon";
import { fetchHtml, parseMoney, ScrapeError } from "./http";
import { searchOfficialStores } from "./official";
import type { RegionConfig } from "@/lib/region/config";
import { getRegion } from "@/lib/region/config";
import type { SearchResult } from "@/lib/types";

export type SearchMode =
  | "serpapi"
  | "scrape"
  | "amazon-scrape"
  | "official-scrape"
  | "empty"
  | "error";

/** Why Google Shopping HTML failed (surfaced in JSON for the UI). */
export type GoogleBlockKind =
  | "ok"
  | "captcha"
  | "js_required"
  | "consent"
  | "unavailable"
  | "blocked"
  | "empty"
  | "parse";

export interface SearchResponse {
  results: SearchResult[];
  mode: SearchMode;
  note: string;
  /** Present when Google HTML was attempted. */
  googleStatus?: GoogleBlockKind;
  googleNote?: string;
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80";

/** Consent cookies so Google skips the interstitial when possible. */
const GOOGLE_CONSENT_COOKIE =
  "CONSENT=YES+cb.20210407-17-p0.en+FX+987; SOCS=CAESHAgBEhJnd3NfMjAyNDA1MjMtMF9SQzIaAmVuIAEaBgiA_LmwBg";

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

function googleHost(region: RegionConfig): string {
  return region.id === "au" ? "www.google.com.au" : "www.google.com";
}

function acceptLanguage(region: RegionConfig): string {
  return region.id === "au"
    ? "en-AU,en;q=0.9"
    : "en-US,en;q=0.9";
}

/** Candidate Shopping URLs — modern udm=28 first, legacy tbm=shop as backup. */
function googleShoppingUrls(query: string, region: RegionConfig): string[] {
  const q = encodeURIComponent(query);
  const hl = encodeURIComponent(region.googleHl);
  const gl = encodeURIComponent(region.googleGl);
  const host = googleHost(region);
  return [
    `https://${host}/search?udm=28&hl=${hl}&gl=${gl}&pws=0&q=${q}`,
    `https://www.google.com/search?udm=28&hl=${hl}&gl=${gl}&pws=0&q=${q}`,
    `https://${host}/search?tbm=shop&hl=${hl}&gl=${gl}&pws=0&q=${q}`,
    `https://www.google.com/search?tbm=shop&hl=${hl}&gl=${gl}&pws=0&q=${q}`,
  ];
}

function googleFetchHeaders(region: RegionConfig): Record<string, string> {
  return {
    "Accept-Language": acceptLanguage(region),
    Cookie: GOOGLE_CONSENT_COOKIE,
    Referer: `https://${googleHost(region)}/`,
    "Sec-Ch-Ua":
      '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-User": "?1",
  };
}

export function classifyGoogleHtml(html: string): GoogleBlockKind {
  const lower = html.toLowerCase();
  if (
    lower.includes("/sorry/") ||
    lower.includes("unusual traffic") ||
    lower.includes("detected unusual traffic") ||
    (lower.includes("captcha") && lower.includes("google"))
  ) {
    return "captcha";
  }
  if (
    lower.includes("enablejs") ||
    lower.includes("/httpservice/retry/enablejs") ||
    (lower.includes("please click") && lower.includes("enablejs"))
  ) {
    return "js_required";
  }
  if (
    lower.includes("consent.google") &&
    !lower.includes("a8pemb") &&
    !lower.includes("sh-dgr")
  ) {
    return "consent";
  }
  if (
    lower.includes("nothing to see here") ||
    lower.includes("details aren't available") ||
    (lower.includes("not available") && lower.includes("google shopping"))
  ) {
    return "unavailable";
  }
  const hasProductMarkers =
    lower.includes("a8pemb") ||
    lower.includes("sh-dgr") ||
    lower.includes("data-docid") ||
    lower.includes("/shopping/product/");
  if (html.length < 2_500 && !hasProductMarkers) {
    return "blocked";
  }
  return "ok";
}

function blockMessage(kind: GoogleBlockKind): string {
  switch (kind) {
    case "captcha":
      return "Google Shopping blocked this request (captcha / unusual traffic).";
    case "js_required":
      return "Google Shopping returned a JavaScript-only shell (common from datacenter IPs).";
    case "consent":
      return "Google Shopping hit a consent interstitial; no product cards returned.";
    case "unavailable":
      return "Google Shopping page reported results unavailable for this request.";
    case "blocked":
      return "Google Shopping HTML was empty or incomplete.";
    case "empty":
      return "Google Shopping HTML had no product cards.";
    case "parse":
      return "Google Shopping HTML could not be parsed into products.";
    default:
      return "Google Shopping scrape failed.";
  }
}

class GoogleScrapeError extends ScrapeError {
  googleStatus: GoogleBlockKind;
  constructor(kind: GoogleBlockKind, message?: string, status?: number) {
    super(message ?? blockMessage(kind), status);
    this.name = "GoogleScrapeError";
    this.code = kind === "captcha" ? "google_captcha" : `google_${kind}`;
    this.googleStatus = kind;
  }
}

function mapSerpResult(
  item: Record<string, unknown>,
  index: number,
  currency: string,
): SearchResult | null {
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  const price =
    parseMoney(String(item.extracted_price ?? item.price ?? "")) ??
    (typeof item.extracted_price === "number" ? item.extracted_price : null);
  if (price == null || price <= 0) return null;
  const thumbnail = String(item.thumbnail ?? item.image ?? "");
  const source = String(item.source ?? item.merchant ?? "Google Shopping");
  const link = String(item.product_link ?? item.link ?? "").trim();
  return {
    id: `serp-${index}-${Buffer.from(title).toString("base64url").slice(0, 12)}`,
    title,
    brand: typeof item.brand === "string" ? item.brand : undefined,
    imageUrl: thumbnail || PLACEHOLDER_IMAGE,
    priceSnippet: price,
    currency,
    merchantHint: source,
    sourceHint: "shopping",
    productUrl: link.startsWith("http") ? link : undefined,
    rating: typeof item.rating === "number" ? item.rating : undefined,
    reviewCount:
      typeof item.reviews === "number"
        ? item.reviews
        : typeof item.reviews === "string"
          ? Number.parseInt(item.reviews, 10) || undefined
          : undefined,
  };
}

async function searchViaSerpApi(
  query: string,
  region: RegionConfig,
): Promise<SearchResult[]> {
  const key = serpKey();
  if (!key) throw new ScrapeError("No SerpAPI key");

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_shopping");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", region.googleHl);
  url.searchParams.set("gl", region.googleGl);
  url.searchParams.set("api_key", key);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new ScrapeError(`SerpAPI HTTP ${res.status}`, res.status);
  const data = (await res.json()) as {
    shopping_results?: Record<string, unknown>[];
    error?: string;
  };
  if (data.error) throw new ScrapeError(data.error);
  return (data.shopping_results ?? [])
    .map((row, i) => mapSerpResult(row, i, region.currency))
    .filter((r): r is SearchResult => r !== null)
    .slice(0, 12);
}

function absoluteGoogleUrl(href: string | undefined, region: RegionConfig): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("javascript:")) return undefined;
  if (trimmed.startsWith("http")) return trimmed.split("&sa=")[0];
  if (trimmed.startsWith("/")) {
    return `https://${googleHost(region)}${trimmed}`;
  }
  return undefined;
}

function pushResult(
  results: SearchResult[],
  seen: Set<string>,
  region: RegionConfig,
  index: number,
  partial: {
    title: string;
    price: number;
    merchant?: string;
    imageUrl?: string;
    productUrl?: string;
  },
) {
  const title = partial.title.trim();
  if (!title || title.length < 4) return;
  const key = title.toLowerCase();
  if (seen.has(key)) return;
  if (partial.price <= 0) return;
  seen.add(key);
  results.push({
    id: `ghtml-${region.id}-${index}-${Buffer.from(title).toString("base64url").slice(0, 12)}`,
    title,
    imageUrl:
      partial.imageUrl && partial.imageUrl.startsWith("http")
        ? partial.imageUrl
        : PLACEHOLDER_IMAGE,
    priceSnippet: partial.price,
    currency: region.currency,
    merchantHint: (partial.merchant ?? "Google Shopping").slice(0, 80),
    sourceHint: "shopping",
    productUrl: partial.productUrl,
  });
}

/** Parse product cards from Google Shopping DOM (legacy + current class names). */
function parseDomCards(
  html: string,
  region: RegionConfig,
): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  const cards = $(
    [
      "div.sh-dgr__grid-result",
      "div.sh-dgr__content",
      "div.sh-pr__product-results",
      "div[data-docid]",
      "div.i0X6kf",
      "div.u30d4",
      "div.shntKv",
      "div.MzEjW",
      "div[jscontroller][data-id]",
    ].join(", "),
  );

  cards.each((index, el) => {
    if (results.length >= 12) return;
    const root = $(el);
    const title =
      root.find("h3, h4").first().text().trim() ||
      root.find("a[aria-label]").first().attr("aria-label")?.trim() ||
      root.find(".tAxDx, .EI11pd, .xFAlLc").first().text().trim() ||
      "";
    if (!title || title.length < 4) return;

    const priceText =
      root.find("span.a8Pemb, span.HRLxBb, span[aria-label*='$'], b.PZPZlf").first().text() ||
      root.find("span").filter((_, s) => /\$[\d,.]+/.test($(s).text())).first().text() ||
      root.text().match(/\$[\d,.]+/)?.[0] ||
      "";
    const price = parseMoney(priceText);
    if (price == null || price <= 0) return;

    const merchant =
      root.find("div.aULzUe, span.IuHnof, div.O8U6h, span.aULzUe, div.WJMUdc").first().text().trim() ||
      "Google Shopping";
    const img =
      root.find("img").first().attr("src") ||
      root.find("img").first().attr("data-src") ||
      "";
    const href =
      root.find('a[href*="/shopping/product/"]').first().attr("href") ||
      root.find('a[href*="url?q="]').first().attr("href") ||
      root.find("a[href]").first().attr("href");

    pushResult(results, seen, region, index, {
      title,
      price,
      merchant,
      imageUrl: img,
      productUrl: absoluteGoogleUrl(href, region),
    });
  });

  return results;
}

/**
 * Pull title/price/link tuples from embedded script JSON when DOM cards are absent.
 * Google obfuscates keys; we match loose string patterns rather than stable schemas.
 */
function parseEmbeddedJson(
  html: string,
  region: RegionConfig,
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const scripts = html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) ?? [];

  const blob = scripts
    .map((s) => s.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, ""))
    .filter((s) => s.length > 200 && /\$|AUD|USD|price|shopping/i.test(s))
    .join("\n");

  if (!blob) return results;

  // Patterns like: "Product Title...","$1,299.00" or "A$1,299.00"
  const pairRe =
    /"([^"]{8,160})"\s*,\s*"(?:A\$|AU\$|US\$|\$)\s*([\d,]+(?:\.\d{2})?)"/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = pairRe.exec(blob)) !== null && results.length < 12) {
    const title = m[1]
      .replace(/\\u[\dA-Fa-f]{4}/g, (u) =>
        String.fromCharCode(Number.parseInt(u.slice(2), 16)),
      )
      .replace(/\\"/g, '"')
      .trim();
    if (/^(http|https|www\.|data:)/i.test(title)) continue;
    if (!/[a-zA-Z]/.test(title)) continue;
    const price = parseMoney(m[2]);
    if (price == null || price <= 0) continue;
    pushResult(results, seen, region, index++, {
      title,
      price,
      merchant: "Google Shopping",
    });
  }

  // shopping/product/ID links near a price
  const linkPriceRe =
    /\/shopping\/product\/(\d+)[^"]{0,40}[\s\S]{0,200}?(?:A\$|AU\$|\$)\s*([\d,]+(?:\.\d{2})?)/g;
  while ((m = linkPriceRe.exec(blob)) !== null && results.length < 12) {
    const productId = m[1];
    const price = parseMoney(m[2]);
    if (price == null) continue;
    // Look backwards for a quoted title
    const start = Math.max(0, m.index - 400);
    const window = blob.slice(start, m.index);
    const titles = [...window.matchAll(/"([^"]{10,120})"/g)].map((x) => x[1]);
    const title = titles.reverse().find(
      (t) =>
        /[a-zA-Z]/.test(t) &&
        !/^https?:/i.test(t) &&
        !/^\d+$/.test(t) &&
        t.length > 8,
    );
    if (!title) continue;
    pushResult(results, seen, region, index++, {
      title,
      price,
      merchant: "Google Shopping",
      productUrl: `https://${googleHost(region)}/shopping/product/${productId}?gl=${region.googleGl}&hl=${region.googleHl}`,
    });
  }

  return results;
}

/** JSON-LD Product / Offer blocks when Google embeds them. */
function parseJsonLd(html: string, region: RegionConfig): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const $ = cheerio.load(html);
  $('script[type="application/ld+json"]').each((index, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as Record<string, unknown> | unknown[];
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const row = item as Record<string, unknown>;
        const type = String(row["@type"] ?? "");
        if (!/Product/i.test(type) && !row.offers) continue;
        const title = String(row.name ?? "").trim();
        const offers = row.offers as Record<string, unknown> | undefined;
        const priceRaw =
          offers?.price ??
          offers?.lowPrice ??
          (Array.isArray(offers) ? (offers[0] as Record<string, unknown>)?.price : undefined);
        const price =
          typeof priceRaw === "number"
            ? priceRaw
            : parseMoney(String(priceRaw ?? ""));
        if (!title || price == null) continue;
        const url = String(row.url ?? offers?.url ?? "");
        const image = Array.isArray(row.image)
          ? String(row.image[0] ?? "")
          : String(row.image ?? "");
        pushResult(results, seen, region, index, {
          title,
          price,
          merchant: String(offers?.seller ?? row.brand ?? "Google Shopping"),
          imageUrl: image,
          productUrl: url.startsWith("http") ? url : undefined,
        });
      }
    } catch {
      // ignore malformed ld+json
    }
  });
  return results;
}

export function parseGoogleShoppingHtml(
  html: string,
  region: RegionConfig,
): SearchResult[] {
  const fromDom = parseDomCards(html, region);
  if (fromDom.length) return fromDom.slice(0, 12);
  const fromLd = parseJsonLd(html, region);
  if (fromLd.length) return fromLd.slice(0, 12);
  return parseEmbeddedJson(html, region).slice(0, 12);
}

async function searchViaHtmlScrape(
  query: string,
  region: RegionConfig,
): Promise<{ results: SearchResult[]; googleStatus: GoogleBlockKind }> {
  const headers = googleFetchHeaders(region);
  let lastKind: GoogleBlockKind = "blocked";
  let lastHtml = "";

  for (const url of googleShoppingUrls(query, region)) {
    try {
      const { html } = await fetchHtml(url, {
        timeoutMs: 8_000,
        minIntervalMs: 2_500,
        bypassCache: true,
        extraHeaders: headers,
      });
      lastHtml = html;
      const kind = classifyGoogleHtml(html);
      lastKind = kind;
      if (kind !== "ok") {
        // Try next URL shape — some hosts differ.
        continue;
      }
      const results = parseGoogleShoppingHtml(html, region);
      if (results.length) {
        return { results, googleStatus: "ok" };
      }
      lastKind = "parse";
    } catch (err) {
      if (err instanceof ScrapeError && err.status === 429) {
        throw new GoogleScrapeError("blocked", "Google Shopping rate-limited (HTTP 429).", 429);
      }
      lastKind = "blocked";
    }
  }

  if (lastKind === "ok" || lastKind === "parse") {
    if (lastHtml && parseGoogleShoppingHtml(lastHtml, region).length === 0) {
      throw new GoogleScrapeError("empty");
    }
    throw new GoogleScrapeError("parse");
  }
  throw new GoogleScrapeError(lastKind);
}

/** Live search only — no mock catalog. Prefer Google HTML scrape; Amazon + official as fallbacks. */
export async function searchProducts(
  query: string,
  region: RegionConfig = getRegion("au"),
): Promise<SearchResponse> {
  const q = query.trim();
  if (!q) {
    return { results: [], mode: "empty", note: "Empty query." };
  }

  let googleStatus: GoogleBlockKind | undefined;
  let googleNote: string | undefined;

  // 1) Direct Google Shopping HTML scrape (no API key). Prefer over SerpAPI.
  try {
    const { results, googleStatus: status } = await searchViaHtmlScrape(q, region);
    return {
      results,
      mode: "scrape",
      note: `Live Google Shopping HTML scrape (${region.shortLabel}, gl=${region.googleGl}).`,
      googleStatus: status,
    };
  } catch (err) {
    if (err instanceof GoogleScrapeError) {
      googleStatus = err.googleStatus;
      googleNote = err.message;
    } else if (err instanceof ScrapeError) {
      googleStatus = "blocked";
      googleNote = err.message;
    } else {
      googleStatus = "blocked";
      googleNote = "Google Shopping scrape failed unexpectedly.";
    }
  }

  // 2) Optional SerpAPI only if a key is already configured (never required).
  if (hasSerpApiKey()) {
    try {
      const results = await searchViaSerpApi(q, region);
      if (results.length) {
        return {
          results,
          mode: "serpapi",
          note: `Google HTML unavailable — SerpAPI fallback (${region.shortLabel}).`,
          googleStatus,
          googleNote,
        };
      }
    } catch {
      // continue to Amazon / official
    }
  }

  // 3) Amazon regional search scrape
  try {
    const results = await searchAmazonAsCatalog(q, region);
    if (results.length) {
      return {
        results,
        mode: "amazon-scrape",
        note: [
          googleNote ?? "Google Shopping unavailable",
          `— ${region.amazonMerchantLabel} search scrape.`,
        ].join(" "),
        googleStatus,
        googleNote,
      };
    }
  } catch {
    // fall through
  }

  // 4) Official brand PDPs
  try {
    const results = await searchOfficialStores(q, region);
    if (results.length) {
      return {
        results,
        mode: "official-scrape",
        note: [
          googleNote ?? "Marketplace search blocked",
          `— live ${region.shortLabel} official brand store scrape.`,
        ].join(" "),
        googleStatus,
        googleNote,
      };
    }
  } catch {
    // fall through
  }

  return {
    results: [],
    mode: "empty",
    note: [
      googleNote ?? `No live ${region.shortLabel} scrape results.`,
      "Retailers blocked this request or returned no matches.",
    ].join(" "),
    googleStatus,
    googleNote,
  };
}
