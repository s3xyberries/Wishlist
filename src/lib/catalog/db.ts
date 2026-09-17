import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), ".data");
export const CATALOG_DB_PATH = path.join(DATA_DIR, "pricekeep.sqlite");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "shared-catalog.json");

let dbSingleton: DatabaseSync | null = null;

function ensureSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS catalog_products (
      id TEXT PRIMARY KEY,
      region TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      title TEXT NOT NULL,
      brand TEXT,
      image_url TEXT NOT NULL,
      price_snippet REAL NOT NULL,
      currency TEXT NOT NULL,
      merchant_hint TEXT NOT NULL,
      source_hint TEXT NOT NULL,
      rating REAL,
      review_count INTEGER,
      last_scraped_at TEXT NOT NULL,
      scrape_mode TEXT NOT NULL,
      hit_count INTEGER NOT NULL DEFAULT 1,
      UNIQUE (region, fingerprint)
    );

    CREATE TABLE IF NOT EXISTS catalog_queries (
      region TEXT NOT NULL,
      query_key TEXT NOT NULL,
      query_text TEXT NOT NULL,
      scraped_at TEXT NOT NULL,
      source_mode TEXT NOT NULL,
      PRIMARY KEY (region, query_key)
    );

    CREATE TABLE IF NOT EXISTS catalog_query_products (
      region TEXT NOT NULL,
      query_key TEXT NOT NULL,
      product_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (region, query_key, product_id),
      FOREIGN KEY (product_id) REFERENCES catalog_products(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tracked_offers (
      id TEXT PRIMARY KEY,
      region TEXT NOT NULL,
      source_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      merchant TEXT NOT NULL,
      currency TEXT NOT NULL,
      last_price REAL NOT NULL,
      last_checked_at TEXT NOT NULL,
      product_id TEXT,
      product_title TEXT,
      notify_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id TEXT PRIMARY KEY,
      offer_id TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      source TEXT NOT NULL,
      FOREIGN KEY (offer_id) REFERENCES tracked_offers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS scheduler_alerts (
      id TEXT PRIMARY KEY,
      offer_id TEXT,
      region TEXT,
      kind TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_products_region ON catalog_products(region);
    CREATE INDEX IF NOT EXISTS idx_tracked_region ON tracked_offers(region);
    CREATE INDEX IF NOT EXISTS idx_history_offer ON price_history(offer_id);
  `);
}

type LegacyCatalogFile = {
  version?: number;
  products?: Record<
    string,
    {
      id: string;
      fingerprint: string;
      title: string;
      brand?: string;
      imageUrl: string;
      priceSnippet: number;
      currency: string;
      merchantHint: string;
      sourceHint: string;
      rating?: number;
      reviewCount?: number;
      lastScrapedAt: string;
      scrapeMode: string;
      queryKeys?: string[];
      hitCount?: number;
    }
  >;
  queries?: Record<
    string,
    {
      queryKey: string;
      queryText: string;
      productIds: string[];
      scrapedAt: string;
      sourceMode: string;
    }
  >;
};

function migrateLegacyJson(db: DatabaseSync) {
  if (!existsSync(LEGACY_JSON_PATH)) return;
  let raw: string;
  try {
    raw = readFileSync(LEGACY_JSON_PATH, "utf8");
  } catch {
    return;
  }

  let parsed: LegacyCatalogFile;
  try {
    parsed = JSON.parse(raw) as LegacyCatalogFile;
  } catch {
    return;
  }

  const count = db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get() as {
    n: number;
  };
  if (count.n > 0) {
    // Already have SQLite data — archive JSON and stop
    try {
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {
      // ignore
    }
    return;
  }

  const region = "us"; // legacy JSON was US-oriented scrapes
  const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO catalog_products (
      id, region, fingerprint, title, brand, image_url, price_snippet, currency,
      merchant_hint, source_hint, rating, review_count, last_scraped_at, scrape_mode, hit_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertQuery = db.prepare(`
    INSERT OR REPLACE INTO catalog_queries (region, query_key, query_text, scraped_at, source_mode)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertLink = db.prepare(`
    INSERT OR REPLACE INTO catalog_query_products (region, query_key, product_id, position)
    VALUES (?, ?, ?, ?)
  `);

  db.exec("BEGIN");
  try {
    for (const p of Object.values(parsed.products ?? {})) {
      insertProduct.run(
        p.id,
        region,
        p.fingerprint,
        p.title,
        p.brand ?? null,
        p.imageUrl,
        p.priceSnippet,
        p.currency || "USD",
        p.merchantHint,
        p.sourceHint,
        p.rating ?? null,
        p.reviewCount ?? null,
        p.lastScrapedAt,
        p.scrapeMode,
        p.hitCount ?? 1,
      );
    }
    for (const q of Object.values(parsed.queries ?? {})) {
      insertQuery.run(region, q.queryKey, q.queryText, q.scrapedAt, q.sourceMode);
      q.productIds.forEach((pid, i) => {
        insertLink.run(region, q.queryKey, pid, i);
      });
    }
    db.exec("COMMIT");
    try {
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {
      // ignore
    }
  } catch {
    db.exec("ROLLBACK");
  }
}

export function getDb(): DatabaseSync {
  if (dbSingleton) return dbSingleton;
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(CATALOG_DB_PATH);
  ensureSchema(db);
  migrateLegacyJson(db);
  dbSingleton = db;
  return db;
}

export function catalogDbPath(): string {
  return CATALOG_DB_PATH;
}
