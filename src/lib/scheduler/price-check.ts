import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/catalog/db";
import { fetchAmazonPrice } from "@/lib/scrape/amazon";
import { fetchEbayPrice } from "@/lib/scrape/ebay";
import { fetchOfficialOrGenericPrice } from "@/lib/scrape/official";
import { listTrackedOffers, type TrackedOfferRow } from "./tracked-offers";

export interface PriceCheckRunResult {
  checked: number;
  updated: number;
  failed: number;
  alerts: number;
  details: Array<{
    offerId: string;
    title: string;
    previous?: number;
    next?: number | null;
    ok: boolean;
    note: string;
  }>;
}

async function fetchPrice(offer: TrackedOfferRow) {
  if (offer.sourceId === "amazon") {
    return fetchAmazonPrice(offer.url, offer.currency);
  }
  if (offer.sourceId === "ebay") {
    return fetchEbayPrice(offer.url, offer.currency);
  }
  return fetchOfficialOrGenericPrice(offer.url, offer.currency);
}

/**
 * Recheck every tracked offer (wishlist/catalog registrations),
 * append price history, and write scheduler alerts on change.
 */
export async function runDailyPriceCheck(options?: {
  region?: string;
}): Promise<PriceCheckRunResult> {
  const offers = await listTrackedOffers(
    options?.region === "au" || options?.region === "us"
      ? options.region
      : undefined,
  );
  const db = await getDb();
  const result: PriceCheckRunResult = {
    checked: 0,
    updated: 0,
    failed: 0,
    alerts: 0,
    details: [],
  };

  const updateOffer = db.prepare(`
    UPDATE tracked_offers
    SET last_price = ?, last_checked_at = ?, currency = ?
    WHERE id = ?
  `);
  const insertHistory = db.prepare(`
    INSERT INTO price_history (id, offer_id, price, currency, captured_at, source)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertAlert = db.prepare(`
    INSERT INTO scheduler_alerts (id, offer_id, region, kind, message, created_at, read)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `);

  for (const offer of offers) {
    result.checked += 1;
    const now = new Date().toISOString();
    try {
      const live = await fetchPrice(offer);
      if (live.mode === "none" || typeof live.price !== "number") {
        result.failed += 1;
        result.details.push({
          offerId: offer.id,
          title: offer.title,
          ok: false,
          note: live.note,
        });
        continue;
      }

      const previous = offer.lastPrice;
      const next = live.price;
      updateOffer.run(next, now, live.currency || offer.currency, offer.id);
      insertHistory.run(
        `pp-${randomUUID()}`,
        offer.id,
        next,
        live.currency || offer.currency,
        now,
        "poll",
      );
      result.updated += 1;

      if (offer.notifyEnabled && Math.abs(next - previous) >= 0.01) {
        const dropped = next < previous;
        insertAlert.run(
          `alert-${randomUUID()}`,
          offer.id,
          offer.region,
          dropped ? "price_drop" : "price_rise",
          `${offer.merchant}: ${offer.productTitle || offer.title} is now ${live.currency || offer.currency} ${next.toFixed(2)} (was ${previous.toFixed(2)}).`,
          now,
        );
        result.alerts += 1;
      }

      result.details.push({
        offerId: offer.id,
        title: offer.title,
        previous,
        next,
        ok: true,
        note: live.note,
      });
    } catch (err) {
      result.failed += 1;
      result.details.push({
        offerId: offer.id,
        title: offer.title,
        ok: false,
        note: err instanceof Error ? err.message : "Price check failed",
      });
    }
  }

  return result;
}
