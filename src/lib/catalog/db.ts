import { mkdirSync, existsSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { CatalogUnavailableError } from "./errors";

export { CatalogUnavailableError } from "./errors";

const DATA_DIR = path.join(process.cwd(), ".data");
export const CATALOG_DB_PATH = path.join(DATA_DIR, "pricekeep.sqlite");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "shared-catalog.json");

/** Recommended Node for native better-sqlite3 builds (Windows/macOS/Linux). */
export const MIN_NODE_VERSION = "20.0.0";

type BetterSqlite3 = typeof import("better-sqlite3");
type CatalogDatabase = import("better-sqlite3").Database;

let DatabaseCtor: BetterSqlite3 | null = null;
let dbSingleton: CatalogDatabase | null = null;
let loadError: CatalogUnavailableError | null = null;

/** Lazy-load native addon — top-level import crashes the whole Next process on Windows ABI mismatch. */
function loadBetterSqlite3(): BetterSqlite3 {
  if (DatabaseCtor) return DatabaseCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    DatabaseCtor = require("better-sqlite3") as BetterSqlite3;
    return DatabaseCtor;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CatalogUnavailableError(
      `better-sqlite3 failed to load (${detail}). Run \`npm install\` (rebuilds the native module). On Windows install Visual Studio Build Tools (Desktop C++).`,
    );
  }
}

function ensureSchema(db: CatalogDatabase) {
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

function migrateLegacyJson(db: CatalogDatabase) {
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
    try {
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {
      // ignore
    }
    return;
  }

  const region = "us";
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

  const tx = db.transaction(() => {
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
  });

  try {
    tx();
    try {
      renameSync(LEGACY_JSON_PATH, `${LEGACY_JSON_PATH}.migrated`);
    } catch {
      // ignore
    }
  } catch {
    // leave JSON in place for a later retry
  }
}

export function getDb(): CatalogDatabase {
  if (dbSingleton) return dbSingleton;
  if (loadError) throw loadError;

  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const Database = loadBetterSqlite3();
    const db = new Database(CATALOG_DB_PATH);
    ensureSchema(db);
    migrateLegacyJson(db);
    dbSingleton = db;
    return db;
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      loadError = err;
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    loadError = new CatalogUnavailableError(
      `Shared catalog failed to open (${detail}). Ensure Node.js >= ${MIN_NODE_VERSION}, run \`npm install\` (rebuilds better-sqlite3), and that .data/ is writable.`,
    );
    throw loadError;
  }
}

export function isCatalogAvailable(): boolean {
  try {
    getDb();
    return true;
  } catch {
    return false;
  }
}

export function catalogAvailabilityNote(): string | null {
  try {
    getDb();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function catalogDbPath(): string {
  return CATALOG_DB_PATH;
}
