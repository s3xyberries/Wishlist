import { createHash } from "node:crypto";
import type { SearchResult } from "@/lib/types";
import type { RegionId } from "@/lib/region/config";
import { getDb } from "./db";
import {
  CATALOG_TTL_MS,
  type CatalogOrigin,
  type CatalogProduct,
  type CatalogQueryEntry,
  type CatalogSearchHit,
} from "./types";

export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function productFingerprint(result: SearchResult, region: RegionId): string {
  const base = [
    region,
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

type ProductRow = {
  id: string;
  region: string;
  fingerprint: string;
  title: string;
  brand: string | null;
  image_url: string;
  price_snippet: number;
  currency: string;
  merchant_hint: string;
  source_hint: string;
  rating: number | null;
  review_count: number | null;
  last_scraped_at: string;
  scrape_mode: string;
  hit_count: number;
};

function rowToProduct(row: ProductRow): CatalogProduct {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    title: row.title,
    brand: row.brand ?? undefined,
    imageUrl: row.image_url,
    priceSnippet: row.price_snippet,
    currency: row.currency,
    merchantHint: row.merchant_hint,
    sourceHint: row.source_hint as CatalogProduct["sourceHint"],
    rating: row.rating ?? undefined,
    reviewCount: row.review_count ?? undefined,
    lastScrapedAt: row.last_scraped_at,
    scrapeMode: row.scrape_mode as CatalogProduct["scrapeMode"],
    queryKeys: [],
    hitCount: row.hit_count,
  };
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

export async function lookupQueryCache(
  query: string,
  region: RegionId,
  ttlMs = CATALOG_TTL_MS,
): Promise<{
  hits: CatalogSearchHit[];
  entry: CatalogQueryEntry | null;
  fresh: boolean;
} | null> {
  const queryKey = normalizeQuery(query);
  if (!queryKey) return null;

  const db = await getDb();
  const entryRow = db
    .prepare(
      `SELECT query_key, query_text, scraped_at, source_mode
       FROM catalog_queries WHERE region = ? AND query_key = ?`,
    )
    .get(region, queryKey) as
    | {
        query_key: string;
        query_text: string;
        scraped_at: string;
        source_mode: string;
      }
    | undefined;

  if (!entryRow) return { hits: [], entry: null, fresh: false };

  const links = db
    .prepare(
      `SELECT product_id FROM catalog_query_products
       WHERE region = ? AND query_key = ? ORDER BY position ASC`,
    )
    .all(region, queryKey) as Array<{ product_id: string }>;

  const hits: CatalogSearchHit[] = [];
  for (const link of links) {
    const row = db
      .prepare(`SELECT * FROM catalog_products WHERE id = ?`)
      .get(link.product_id) as ProductRow | undefined;
    if (row) hits.push(toSearchHit(rowToProduct(row)));
  }

  const entry: CatalogQueryEntry = {
    queryKey: entryRow.query_key,
    queryText: entryRow.query_text,
    productIds: links.map((l) => l.product_id),
    scrapedAt: entryRow.scraped_at,
    sourceMode: entryRow.source_mode as CatalogQueryEntry["sourceMode"],
  };

  return {
    hits,
    entry,
    fresh: hits.length > 0 && isFresh(entry.scrapedAt, ttlMs),
  };
}

export async function matchCatalogProducts(
  query: string,
  region: RegionId,
  limit = 12,
): Promise<CatalogSearchHit[]> {
  const queryKey = normalizeQuery(query);
  const tokens = queryKey.split(" ").filter((t) => t.length >= 2);
  if (!tokens.length) return [];

  const db = await getDb();
  const rows = db
    .prepare(`SELECT * FROM catalog_products WHERE region = ?`)
    .all(region) as ProductRow[];

  const scored = rows
    .map((row) => {
      const p = rowToProduct(row);
      const hay = `${p.brand ?? ""} ${p.title}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return null;
      const scrapedAt = Date.parse(p.lastScrapedAt);
      const ageHours = Number.isFinite(scrapedAt)
        ? (Date.now() - scrapedAt) / 3_600_000
        : 999;
      const score =
        p.hitCount * 2 - Math.min(ageHours, 48) + (isFresh(p.lastScrapedAt) ? 10 : 0);
      return { product: p, score };
    })
    .filter((x): x is { product: CatalogProduct; score: number } => x != null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ product }) => toSearchHit(product));
}

export async function recordSearchResults(
  query: string,
  region: RegionId,
  results: SearchResult[],
  sourceMode: Exclude<CatalogOrigin, "catalog">,
): Promise<CatalogSearchHit[]> {
  const queryKey = normalizeQuery(query);
  if (!queryKey || results.length === 0) return [];

  const db = await getDb();
  const now = new Date().toISOString();
  const products: CatalogProduct[] = [];

  db.exec("BEGIN");
  try {
    const upsert = db.prepare(`
      INSERT INTO catalog_products (
        id, region, fingerprint, title, brand, image_url, price_snippet, currency,
        merchant_hint, source_hint, rating, review_count, last_scraped_at, scrape_mode, hit_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(region, fingerprint) DO UPDATE SET
        title = excluded.title,
        brand = excluded.brand,
        image_url = excluded.image_url,
        price_snippet = excluded.price_snippet,
        currency = excluded.currency,
        merchant_hint = excluded.merchant_hint,
        source_hint = excluded.source_hint,
        rating = COALESCE(excluded.rating, catalog_products.rating),
        review_count = COALESCE(excluded.review_count, catalog_products.review_count),
        last_scraped_at = excluded.last_scraped_at,
        scrape_mode = excluded.scrape_mode,
        hit_count = catalog_products.hit_count + 1
    `);

    for (const result of results) {
      const fingerprint = productFingerprint(result, region);
      const id = `cat-${region}-${fingerprint}`;
      upsert.run(
        id,
        region,
        fingerprint,
        result.title,
        result.brand ?? null,
        result.imageUrl,
        result.priceSnippet,
        result.currency,
        result.merchantHint,
        result.sourceHint,
        result.rating ?? null,
        result.reviewCount ?? null,
        now,
        sourceMode,
      );
      const row = db
        .prepare(`SELECT * FROM catalog_products WHERE id = ?`)
        .get(id) as ProductRow;
      products.push(rowToProduct(row));
    }

    db.prepare(
      `INSERT OR REPLACE INTO catalog_queries (region, query_key, query_text, scraped_at, source_mode)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(region, queryKey, query.trim(), now, sourceMode);

    db.prepare(
      `DELETE FROM catalog_query_products WHERE region = ? AND query_key = ?`,
    ).run(region, queryKey);

    const link = db.prepare(
      `INSERT INTO catalog_query_products (region, query_key, product_id, position)
       VALUES (?, ?, ?, ?)`,
    );
    products.forEach((p, i) => link.run(region, queryKey, p.id, i));

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return products.map(toSearchHit);
}

export async function listCatalog(options?: {
  q?: string;
  region?: RegionId;
  limit?: number;
}): Promise<{
  products: CatalogSearchHit[];
  queries: CatalogQueryEntry[];
  totalProducts: number;
  updatedAt: string | null;
  region: RegionId;
}> {
  const limit = options?.limit ?? 40;
  const region = options?.region ?? "au";
  const q = options?.q ? normalizeQuery(options.q) : "";
  const tokens = q.split(" ").filter(Boolean);

  const db = await getDb();
  let rows = db
    .prepare(
      `SELECT * FROM catalog_products WHERE region = ? ORDER BY last_scraped_at DESC`,
    )
    .all(region) as ProductRow[];

  if (tokens.length) {
    rows = rows.filter((row) => {
      const hay = `${row.brand ?? ""} ${row.title} ${row.merchant_hint}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }

  const totalProducts = (
    db
      .prepare(`SELECT COUNT(*) AS n FROM catalog_products WHERE region = ?`)
      .get(region) as { n: number }
  ).n;

  const products = rows.slice(0, limit).map((r) => toSearchHit(rowToProduct(r)));

  const queryRows = db
    .prepare(
      `SELECT query_key, query_text, scraped_at, source_mode
       FROM catalog_queries WHERE region = ? ORDER BY scraped_at DESC LIMIT 30`,
    )
    .all(region) as Array<{
    query_key: string;
    query_text: string;
    scraped_at: string;
    source_mode: string;
  }>;

  const queries: CatalogQueryEntry[] = queryRows.map((qr) => {
    const links = db
      .prepare(
        `SELECT product_id FROM catalog_query_products
         WHERE region = ? AND query_key = ? ORDER BY position`,
      )
      .all(region, qr.query_key) as Array<{ product_id: string }>;
    return {
      queryKey: qr.query_key,
      queryText: qr.query_text,
      productIds: links.map((l) => l.product_id),
      scrapedAt: qr.scraped_at,
      sourceMode: qr.source_mode as CatalogQueryEntry["sourceMode"],
    };
  });

  const latest = rows[0]?.last_scraped_at ?? null;

  return {
    products,
    queries,
    totalProducts,
    updatedAt: latest,
    region,
  };
}
