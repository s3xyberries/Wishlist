import { createHash } from "node:crypto";
import { getDb } from "@/lib/catalog/db";
import { CATALOG_TTL_MS } from "@/lib/catalog/types";
import type { RegionConfig, RegionId } from "@/lib/region/config";
import { getRegion } from "@/lib/region/config";
import { scrapeProductUrl, validateProductUrl } from "@/lib/scrape/product-url";
import { ScrapeError } from "@/lib/scrape/http";
import type { SearchResult } from "@/lib/types";

export interface WatchedPage {
  id: string;
  region: RegionId;
  url: string;
  /** Words used to match this page during search. Defaults to the scraped title. */
  label: string;
  title: string;
  brand?: string;
  imageUrl: string;
  price: number;
  currency: string;
  merchant: string;
  lastScrapedAt: string;
  lastError?: string;
  createdAt: string;
}

export interface PageRefreshSummary {
  checked: number;
  updated: number;
  failed: number;
}

function pageId(region: string, url: string): string {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 12);
  return `page-${region}-${hash}`;
}

export function normalizePageUrl(raw: string): string {
  const parsed = validateProductUrl(raw);
  parsed.hash = "";
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  parsed.pathname = path;
  return parsed.toString();
}

function rowToPage(row: Record<string, unknown>): WatchedPage {
  return {
    id: String(row.id),
    region: String(row.region) === "us" ? "us" : "au",
    url: String(row.url),
    label: String(row.label),
    title: String(row.title),
    brand: row.brand ? String(row.brand) : undefined,
    imageUrl: String(row.image_url),
    price: Number(row.price),
    currency: String(row.currency),
    merchant: String(row.merchant),
    lastScrapedAt: String(row.last_scraped_at),
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: String(row.created_at),
  };
}

function pageMatches(page: WatchedPage, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const hay = `${page.title} ${page.label} ${page.brand ?? ""} ${page.merchant} ${page.url}`.toLowerCase();
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

function currencyForPage(
  url: string,
  scrapedCurrency: string,
  region: RegionConfig,
): string {
  const host = new URL(url).hostname.toLowerCase();
  const regionalAu =
    region.id === "au" &&
    (host.endsWith(".com.au") || host.startsWith("au.") || host.includes(".au."));
  if (regionalAu) return "AUD";
  return scrapedCurrency || region.currency;
}

function toSearchResult(page: WatchedPage): SearchResult {
  return {
    id: page.id,
    title: page.title,
    brand: page.brand,
    imageUrl: page.imageUrl,
    priceSnippet: page.price,
    currency: page.currency,
    merchantHint: page.merchant,
    sourceHint: "generic",
    productUrl: page.url,
  };
}

async function readPage(id: string): Promise<WatchedPage | null> {
  const db = await getDb();
  const row = db.prepare("SELECT * FROM watched_pages WHERE id = ?").get(id);
  return row ? rowToPage(row) : null;
}

export async function listWatchedPages(region: RegionId): Promise<WatchedPage[]> {
  const db = await getDb();
  const rows = db
    .prepare(
      "SELECT * FROM watched_pages WHERE region = ? ORDER BY created_at DESC",
    )
    .all(region);
  return rows.map(rowToPage);
}

async function writePage(
  page: WatchedPage,
): Promise<void> {
  const db = await getDb();
  db.prepare(
    `INSERT OR REPLACE INTO watched_pages (
      id, region, url, label, title, brand, image_url, price, currency, merchant,
      last_scraped_at, last_error, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    page.id,
    page.region,
    page.url,
    page.label,
    page.title,
    page.brand ?? null,
    page.imageUrl,
    page.price,
    page.currency,
    page.merchant,
    page.lastScrapedAt,
    page.lastError ?? null,
    page.createdAt,
  );
}

export async function addWatchedPage(input: {
  url: string;
  label?: string;
  region: RegionConfig;
}): Promise<WatchedPage> {
  const url = normalizePageUrl(input.url);
  const scraped = await scrapeProductUrl(url, input.region);
  const db = await getDb();
  const existing = db
    .prepare("SELECT created_at FROM watched_pages WHERE region = ? AND url = ?")
    .get(input.region.id, url) as { created_at?: string } | undefined;
  const now = new Date().toISOString();
  const page: WatchedPage = {
    id: pageId(input.region.id, url),
    region: input.region.id,
    url,
    label: (input.label?.trim() || scraped.title).slice(0, 200),
    title: scraped.title,
    brand: scraped.brand,
    imageUrl: scraped.imageUrl,
    price: scraped.price,
    currency: currencyForPage(url, scraped.currency, input.region),
    merchant: scraped.merchant,
    lastScrapedAt: now,
    createdAt: existing?.created_at ? String(existing.created_at) : now,
  };
  await writePage(page);
  return page;
}

export async function deleteWatchedPage(
  id: string,
  region: RegionId,
): Promise<boolean> {
  const db = await getDb();
  const existing = db
    .prepare("SELECT id FROM watched_pages WHERE id = ? AND region = ?")
    .get(id, region);
  if (!existing) return false;
  db.prepare("DELETE FROM watched_pages WHERE id = ? AND region = ?").run(
    id,
    region,
  );
  return true;
}

export async function refreshWatchedPage(id: string): Promise<WatchedPage> {
  const current = await readPage(id);
  if (!current) throw new ScrapeError("Saved page not found");
  const region = getRegion(current.region);
  try {
    const scraped = await scrapeProductUrl(current.url, region);
    const next: WatchedPage = {
      ...current,
      title: scraped.title,
      brand: scraped.brand,
      imageUrl: scraped.imageUrl,
      price: scraped.price,
      currency: currencyForPage(current.url, scraped.currency, region),
      merchant: scraped.merchant,
      lastScrapedAt: new Date().toISOString(),
      lastError: undefined,
    };
    await writePage(next);
    return next;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Price scrape failed";
    const failed: WatchedPage = {
      ...current,
      lastScrapedAt: new Date().toISOString(),
      lastError: message,
    };
    await writePage(failed);
    throw new ScrapeError(message);
  }
}

export async function refreshWatchedPages(
  region?: RegionId,
): Promise<PageRefreshSummary> {
  const db = await getDb();
  const rows = region
    ? db.prepare("SELECT id FROM watched_pages WHERE region = ?").all(region)
    : db.prepare("SELECT id FROM watched_pages").all();
  const summary: PageRefreshSummary = {
    checked: 0,
    updated: 0,
    failed: 0,
  };
  for (const row of rows) {
    summary.checked += 1;
    try {
      await refreshWatchedPage(String(row.id));
      summary.updated += 1;
    } catch {
      summary.failed += 1;
    }
  }
  return summary;
}

/**
 * Match saved pages for a search and scrape again when the stored price is stale.
 */
export async function searchWatchedPages(
  query: string,
  region: RegionConfig,
): Promise<SearchResult[]> {
  const pages = await listWatchedPages(region.id);
  const matches = pages.filter((page) => pageMatches(page, query));
  const results: SearchResult[] = [];
  for (const page of matches) {
    const age = Date.now() - Date.parse(page.lastScrapedAt);
    const fresh = Number.isFinite(age) && age >= 0 && age < CATALOG_TTL_MS;
    if (fresh) {
      results.push(toSearchResult(page));
      continue;
    }
    try {
      results.push(toSearchResult(await refreshWatchedPage(page.id)));
    } catch {
      results.push(toSearchResult(page));
    }
  }
  return results;
}
