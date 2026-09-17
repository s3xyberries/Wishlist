import { getDb } from "@/lib/catalog/db";
import type { RegionId } from "@/lib/region/config";
import type { SourceId } from "@/lib/types";

export interface TrackedOfferRow {
  id: string;
  region: RegionId;
  sourceId: SourceId;
  url: string;
  title: string;
  merchant: string;
  currency: string;
  lastPrice: number;
  lastCheckedAt: string;
  productId?: string;
  productTitle?: string;
  notifyEnabled: boolean;
}

export function upsertTrackedOffers(offers: TrackedOfferRow[]) {
  if (!offers.length) return;
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO tracked_offers (
      id, region, source_id, url, title, merchant, currency,
      last_price, last_checked_at, product_id, product_title, notify_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      url = excluded.url,
      title = excluded.title,
      merchant = excluded.merchant,
      currency = excluded.currency,
      last_price = excluded.last_price,
      last_checked_at = excluded.last_checked_at,
      product_id = excluded.product_id,
      product_title = excluded.product_title,
      notify_enabled = excluded.notify_enabled,
      region = excluded.region
  `);

  db.exec("BEGIN");
  try {
    for (const o of offers) {
      stmt.run(
        o.id,
        o.region,
        o.sourceId,
        o.url,
        o.title,
        o.merchant,
        o.currency,
        o.lastPrice,
        o.lastCheckedAt,
        o.productId ?? null,
        o.productTitle ?? null,
        o.notifyEnabled ? 1 : 0,
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listTrackedOffers(region?: RegionId): TrackedOfferRow[] {
  const db = getDb();
  const rows = region
    ? (db
        .prepare(`SELECT * FROM tracked_offers WHERE region = ?`)
        .all(region) as Array<Record<string, unknown>>)
    : (db.prepare(`SELECT * FROM tracked_offers`).all() as Array<
        Record<string, unknown>
      >);

  return rows.map((r) => ({
    id: String(r.id),
    region: r.region as RegionId,
    sourceId: r.source_id as SourceId,
    url: String(r.url),
    title: String(r.title),
    merchant: String(r.merchant),
    currency: String(r.currency),
    lastPrice: Number(r.last_price),
    lastCheckedAt: String(r.last_checked_at),
    productId: r.product_id ? String(r.product_id) : undefined,
    productTitle: r.product_title ? String(r.product_title) : undefined,
    notifyEnabled: Boolean(r.notify_enabled),
  }));
}
