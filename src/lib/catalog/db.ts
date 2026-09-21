/**
 * Catalog DB via sql.js (WASM SQLite) — no native addon.
 * Exposes a better-sqlite3-like sync API once opened; persist to `.data/pricekeep.sqlite`.
 */
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { CatalogUnavailableError } from "./errors";

export { CatalogUnavailableError } from "./errors";

const DATA_DIR = path.join(process.cwd(), ".data");
export const CATALOG_DB_PATH = path.join(DATA_DIR, "pricekeep.sqlite");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "shared-catalog.json");

/** Node floor for tooling; sql.js itself is pure WASM/JS (Windows-safe). */
export const MIN_NODE_VERSION = "20.0.0";
export const CATALOG_DRIVER = "sql.js" as const;

type SqlJsDatabase = import("sql.js").Database;
type SqlJsStatic = import("sql.js").SqlJsStatic;

export type SqlValue = string | number | null | Uint8Array | undefined;

export interface CatalogStatement {
  get(...params: SqlValue[]): Record<string, unknown> | undefined;
  all(...params: SqlValue[]): Array<Record<string, unknown>>;
  run(...params: SqlValue[]): void;
}

export interface CatalogDatabase {
  prepare(sql: string): CatalogStatement;
  exec(sql: string): void;
  transaction(fn: () => void): () => void;
}

let SQL: SqlJsStatic | null = null;
let rawDb: SqlJsDatabase | null = null;
let dbSingleton: CatalogDatabase | null = null;
let loadError: CatalogUnavailableError | null = null;
let openPromise: Promise<CatalogDatabase> | null = null;
let txDepth = 0;
let dirty = false;

function persistIfNeeded() {
  if (!rawDb || txDepth > 0 || !dirty) return;
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const data = rawDb.export();
    writeFileSync(CATALOG_DB_PATH, Buffer.from(data));
    dirty = false;
    // Drop leftover WAL files from the old better-sqlite3 era.
    for (const suffix of ["-wal", "-shm"]) {
      const p = `${CATALOG_DB_PATH}${suffix}`;
      if (existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CatalogUnavailableError(
      `Failed to persist catalog DB (${detail}). Ensure .data/ is writable.`,
    );
  }
}

function markDirty() {
  dirty = true;
  persistIfNeeded();
}

function bindParams(stmt: import("sql.js").Statement, params: SqlValue[]) {
  if (!params.length) return;
  // sql.js bind is 1-based for ? placeholders when using array
  stmt.bind(params as (string | number | null | Uint8Array)[]);
}

function createAdapter(db: SqlJsDatabase): CatalogDatabase {
  return {
    prepare(sql: string): CatalogStatement {
      return {
        get(...params: SqlValue[]) {
          const stmt = db.prepare(sql);
          try {
            bindParams(stmt, params);
            if (stmt.step()) {
              return stmt.getAsObject() as Record<string, unknown>;
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        all(...params: SqlValue[]) {
          const stmt = db.prepare(sql);
          const rows: Array<Record<string, unknown>> = [];
          try {
            bindParams(stmt, params);
            while (stmt.step()) {
              rows.push(stmt.getAsObject() as Record<string, unknown>);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
        run(...params: SqlValue[]) {
          db.run(sql, params as (string | number | null | Uint8Array)[]);
          markDirty();
        },
      };
    },
    exec(sql: string) {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed === "BEGIN" || trimmed.startsWith("BEGIN ")) {
        db.run("BEGIN");
        txDepth += 1;
        return;
      }
      if (trimmed === "COMMIT" || trimmed.startsWith("COMMIT ")) {
        db.run("COMMIT");
        txDepth = Math.max(0, txDepth - 1);
        dirty = true;
        persistIfNeeded();
        return;
      }
      if (trimmed === "ROLLBACK" || trimmed.startsWith("ROLLBACK ")) {
        db.run("ROLLBACK");
        txDepth = Math.max(0, txDepth - 1);
        dirty = false;
        return;
      }
      db.exec(sql);
      if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("PRAGMA")) {
        markDirty();
      }
    },
    transaction(fn: () => void) {
      return () => {
        db.run("BEGIN");
        txDepth += 1;
        try {
          fn();
          db.run("COMMIT");
          txDepth = Math.max(0, txDepth - 1);
          dirty = true;
          persistIfNeeded();
        } catch (err) {
          try {
            db.run("ROLLBACK");
          } catch {
            // ignore
          }
          txDepth = Math.max(0, txDepth - 1);
          dirty = false;
          throw err;
        }
      };
    },
  };
}

function ensureSchema(db: CatalogDatabase) {
  // sql.js: avoid WAL pragma (single-file export).
  db.exec(`
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

  const count = db.prepare("SELECT COUNT(*) AS n FROM catalog_products").get() as
    | { n: number }
    | undefined;
  if ((count?.n ?? 0) > 0) {
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
    // leave JSON for retry
  }
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("sql.js") as
    | ((cfg?: { locateFile?: (file: string) => string }) => Promise<SqlJsStatic>)
    | {
        default?: (cfg?: {
          locateFile?: (file: string) => string;
        }) => Promise<SqlJsStatic>;
      };
  const initSqlJs =
    typeof mod === "function" ? mod : mod.default;
  if (typeof initSqlJs !== "function") {
    throw new CatalogUnavailableError(
      "sql.js module did not export an initializer function",
    );
  }
  // Resolve WASM from process.cwd() so Next/webpack cannot pass a numeric module id as a path.
  const distDir = path.join(process.cwd(), "node_modules", "sql.js", "dist");
  const wasmFile = path.join(distDir, "sql-wasm.wasm");
  if (!existsSync(wasmFile)) {
    throw new CatalogUnavailableError(
      `sql.js WASM missing at ${wasmFile}. Run npm install.`,
    );
  }
  SQL = await initSqlJs({
    locateFile: (file: string) => {
      if (typeof file !== "string") {
        throw new CatalogUnavailableError(
          `sql.js locateFile expected string, got ${typeof file}`,
        );
      }
      return path.join(distDir, file);
    },
  });
  return SQL;
}

async function openInternal(): Promise<CatalogDatabase> {
  if (dbSingleton) return dbSingleton;
  if (loadError) throw loadError;

  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const sqlJs = await loadSqlJs();

    let fileBuffer: Uint8Array | undefined;
    if (existsSync(CATALOG_DB_PATH)) {
      try {
        fileBuffer = new Uint8Array(readFileSync(CATALOG_DB_PATH));
      } catch {
        fileBuffer = undefined;
      }
    }

    try {
      rawDb = fileBuffer?.length
        ? new sqlJs.Database(fileBuffer)
        : new sqlJs.Database();
    } catch {
      // Corrupt / incompatible (e.g. incomplete WAL from better-sqlite3) — start fresh.
      try {
        renameSync(CATALOG_DB_PATH, `${CATALOG_DB_PATH}.bak-${Date.now()}`);
      } catch {
        // ignore
      }
      rawDb = new sqlJs.Database();
    }

    dbSingleton = createAdapter(rawDb);
    ensureSchema(dbSingleton);
    migrateLegacyJson(dbSingleton);
    dirty = true;
    persistIfNeeded();
    return dbSingleton;
  } catch (err) {
    if (err instanceof CatalogUnavailableError) {
      loadError = err;
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    loadError = new CatalogUnavailableError(
      `Shared catalog failed to open (${detail}). sql.js could not initialize. Ensure .data/ is writable and run \`npm install\`.`,
    );
    throw loadError;
  }
}

/** Open (or return) the catalog DB. Always await this — never import native addons. */
export async function getDb(): Promise<CatalogDatabase> {
  if (dbSingleton) return dbSingleton;
  if (!openPromise) {
    openPromise = openInternal().catch((err) => {
      openPromise = null;
      throw err;
    });
  }
  return openPromise;
}

export async function isCatalogAvailable(): Promise<boolean> {
  try {
    await getDb();
    return true;
  } catch {
    return false;
  }
}

export async function catalogAvailabilityNote(): Promise<string | null> {
  try {
    await getDb();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function catalogDbPath(): string {
  return CATALOG_DB_PATH;
}
