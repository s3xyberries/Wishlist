import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SearchResult } from "@/lib/types";
import {
  CATALOG_TTL_MS,
  type CatalogFile,
  type CatalogOrigin,
  type CatalogProduct,
  type CatalogQueryEntry,
  type CatalogSearchHit,
} from "./types";

const DATA_DIR = path.join(process.cwd(), ".data");
const CATALOG_PATH = path.join(DATA_DIR, "shared-catalog.json");

const EMPTY: CatalogFile = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  products: {},
  queries: {},
};

/** Serialize catalog reads/writes across concurrent requests in this process. */
let chain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productFingerprint(result: SearchResult): string {
  const base = [
    result.brand?.toLowerCase().trim() ?? "",
    result.title.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim(),
    result.merchantHint.toLowerCase().trim(),
    result.sourceHint,
  ].join("|");
  return createHash("sha1").update(base).digest("hex").slice(0, 16);
}

function isFresh(iso: string, ttlMs = CATALOG_TTL_MS): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ttlMs;
}

async function readCatalogUnlocked(): Promise<CatalogFile> {
  try {
    const raw = await readFile(CATALOG_PATH, "utf8");
    const parsed = JSON.parse(raw) as CatalogFile;
    if (parsed?.version !== 1 || !parsed.products || !parsed.queries) {
      return structuredClone(EMPTY);
    }
    return parsed;
  } catch {
    return structuredClone(EMPTY);
  }
}

async function writeCatalogUnlocked(file: CatalogFile): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  file.updatedAt = new Date().toISOString();
  const tmp = `${CATALOG_PATH}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await rename(tmp, CATALOG_PATH);
}

function toSearchHit(product: CatalogProduct): CatalogSearchHit {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    imageUrl: product.imageUrl,
    priceSnippet: product.priceSnippet,
    currency: product.currency,
    merchantHint: product.merchantHint,
    sourceHint: product.sourceHint,
    rating: product.rating,
    reviewCount: product.reviewCount,
    fromCatalog: true,
    lastScrapedAt: product.lastScrapedAt,
  };
}

function upsertProduct(
  file: CatalogFile,
  result: SearchResult,
  scrapeMode: Exclude<CatalogOrigin, "catalog">,
  queryKey: string,
  now: string,
): CatalogProduct {
  const fingerprint = productFingerprint(result);
  const existing = file.products[fingerprint];
  const queryKeys = new Set(existing?.queryKeys ?? []);
  if (queryKey) queryKeys.add(queryKey);

  const next: CatalogProduct = {
    id: existing?.id ?? `cat-${fingerprint}`,
    fingerprint,
    title: result.title,
    brand: result.brand,
    imageUrl: result.imageUrl,
    priceSnippet: result.priceSnippet,
    currency: result.currency,
    merchantHint: result.merchantHint,
    sourceHint: result.sourceHint,
    rating: result.rating ?? existing?.rating,
    reviewCount: result.reviewCount ?? existing?.reviewCount,
    lastScrapedAt: now,
    scrapeMode,
    queryKeys: [...queryKeys].slice(0, 24),
    hitCount: (existing?.hitCount ?? 0) + 1,
  };
  file.products[next.id] = next;
  // Drop legacy fingerprint-keyed row if present
  if (file.products[fingerprint] && fingerprint !== next.id) {
    delete file.products[fingerprint];
  }
  return next;
}

/**
 * Look up a fresh query cache entry. Returns hits when present and within TTL.
 */
export async function lookupQueryCache(
  query: string,
  ttlMs = CATALOG_TTL_MS,
): Promise<{
  hits: CatalogSearchHit[];
  entry: CatalogQueryEntry | null;
  fresh: boolean;
} | null> {
  const queryKey = normalizeQuery(query);
  if (!queryKey) return null;

  return withLock(async () => {
    const file = await readCatalogUnlocked();
    const entry = file.queries[queryKey];
    if (!entry) return { hits: [], entry: null, fresh: false };

    const hits = entry.productIds
      .map((id) => {
        const direct = file.products[id];
        if (direct) return toSearchHit(direct);
        const fp = id.startsWith("cat-") ? id.slice(4) : id;
        const byFp = Object.values(file.products).find(
          (p) => p.fingerprint === fp || p.id === `cat-${fp}`,
        );
        return byFp ? toSearchHit(byFp) : null;
      })
      .filter((h): h is CatalogSearchHit => h != null);

    return {
      hits,
      entry,
      fresh: hits.length > 0 && isFresh(entry.scrapedAt, ttlMs),
    };
  });
}

/**
 * Soft match: products whose title/brand contain all query tokens.
 * Used when exact query cache misses — still avoids a scrape when possible.
 */
export async function matchCatalogProducts(
  query: string,
  limit = 12,
): Promise<CatalogSearchHit[]> {
  const queryKey = normalizeQuery(query);
  const tokens = queryKey.split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  return withLock(async () => {
    const file = await readCatalogUnlocked();
    const scored = Object.values(file.products)
      .map((p) => {
        const hay = `${p.brand ?? ""} ${p.title}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return null;
        // Prefer fresher + more hit products
        const scrapedAt = Date.parse(p.lastScrapedAt);
        const ageHours = Number.isFinite(scrapedAt)
          ? (Date.now() - scrapedAt) / 3_600_000
          : 999;
        const score = p.hitCount * 2 - Math.min(ageHours, 48) + (isFresh(p.lastScrapedAt) ? 10 : 0);
        return { product: p, score };
      })
      .filter((x): x is { product: CatalogProduct; score: number } => x != null)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(({ product }) => toSearchHit(product));
  });
}

export async function recordSearchResults(
  query: string,
  results: SearchResult[],
  sourceMode: Exclude<CatalogOrigin, "catalog">,
): Promise<CatalogSearchHit[]> {
  const queryKey = normalizeQuery(query);
  if (!queryKey || results.length === 0) return [];

  return withLock(async () => {
    const file = await readCatalogUnlocked();
    const now = new Date().toISOString();
    const products = results.map((r) =>
      upsertProduct(file, r, sourceMode, queryKey, now),
    );

    file.queries[queryKey] = {
      queryKey,
      queryText: query.trim(),
      productIds: products.map((p) => p.id),
      scrapedAt: now,
      sourceMode,
    };

    await writeCatalogUnlocked(file);
    return products.map(toSearchHit);
  });
}

export async function listCatalog(options?: {
  q?: string;
  limit?: number;
}): Promise<{
  products: CatalogSearchHit[];
  queries: CatalogQueryEntry[];
  totalProducts: number;
  updatedAt: string | null;
}> {
  const limit = options?.limit ?? 40;
  const q = options?.q ? normalizeQuery(options.q) : "";
  const tokens = q.split(" ").filter(Boolean);

  return withLock(async () => {
    const file = await readCatalogUnlocked();
    let products = Object.values(file.products);
    if (tokens.length) {
      products = products.filter((p) => {
        const hay = `${p.brand ?? ""} ${p.title} ${p.merchantHint}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
    }
    products = products
      .sort((a, b) => b.lastScrapedAt.localeCompare(a.lastScrapedAt))
      .slice(0, limit);

    const queries = Object.values(file.queries)
      .sort((a, b) => b.scrapedAt.localeCompare(a.scrapedAt))
      .slice(0, 30);

    return {
      products: products.map(toSearchHit),
      queries,
      totalProducts: Object.keys(file.products).length,
      updatedAt:
        file.updatedAt && file.updatedAt !== new Date(0).toISOString()
          ? file.updatedAt
          : null,
    };
  });
}

export function catalogPathForDebug(): string {
  return CATALOG_PATH;
}
