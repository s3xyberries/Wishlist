import { NextResponse } from "next/server";
import { regionFromRequest, parseRegionId } from "@/lib/region/server";
import { getRegion } from "@/lib/region/config";
import { scrapeProductUrl, validateProductUrl } from "@/lib/scrape/product-url";
import { ScrapeError } from "@/lib/scrape/http";
import { upsertTrackedOffers, appendPriceHistoryPoint } from "@/lib/scheduler/tracked-offers";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * Paste a product URL → scrape title/price → register tracked offer for scheduler.
 * POST { url, productId?: string, region?: string }
 */
export async function POST(request: Request) {
  let body: { url?: string; productId?: string; region?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body.url?.trim() ?? "";
  try {
    validateProductUrl(rawUrl);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof ScrapeError ? err.message : "Invalid URL",
      },
      { status: 400 },
    );
  }

  const region = body.region
    ? getRegion(parseRegionId(body.region))
    : await regionFromRequest(request);

  try {
    const scraped = await scrapeProductUrl(rawUrl, region);
    const now = new Date().toISOString();
    const urlHash = createHash("sha1").update(scraped.url).digest("hex").slice(0, 10);
    const productId =
      body.productId?.trim() ||
      `prod-link-${region.id}-${urlHash}-${Date.now().toString(36)}`;
    const offerId = `${productId}-link-${urlHash}`;

    const offer = {
      id: offerId,
      productId,
      sourceId: scraped.sourceId,
      title: scraped.title,
      url: scraped.url,
      merchant: scraped.merchant,
      currency: scraped.currency,
      status: "active" as const,
      lastPrice: scraped.price,
      lastCheckedAt: now,
    };

    upsertTrackedOffers([
      {
        id: offer.id,
        region: region.id,
        sourceId: offer.sourceId,
        url: offer.url,
        title: offer.title,
        merchant: offer.merchant,
        currency: offer.currency,
        lastPrice: offer.lastPrice,
        lastCheckedAt: offer.lastCheckedAt,
        productId,
        productTitle: scraped.title,
        notifyEnabled: true,
      },
    ]);
    appendPriceHistoryPoint({
      id: `pp-${offerId}`,
      offerId: offer.id,
      price: scraped.price,
      currency: scraped.currency,
      capturedAt: now,
      source: "manual",
    });

    const product = {
      id: productId,
      title: scraped.title,
      brand: scraped.brand,
      imageUrl: scraped.imageUrl,
      queryText: scraped.url,
      createdAt: now,
      notifyEnabled: true,
    };

    const pricePoint = {
      id: `pp-${offerId}`,
      offerId: offer.id,
      price: scraped.price,
      currency: scraped.currency,
      capturedAt: now,
      source: "manual" as const,
    };

    return NextResponse.json({
      ok: true,
      region: region.id,
      currency: scraped.currency,
      note: scraped.note,
      attachedToExisting: Boolean(body.productId),
      product,
      offer,
      pricePoint,
      scraped: {
        title: scraped.title,
        price: scraped.price,
        currency: scraped.currency,
        merchant: scraped.merchant,
        url: scraped.url,
        sourceId: scraped.sourceId,
        imageUrl: scraped.imageUrl,
      },
    });
  } catch (err) {
    const message =
      err instanceof ScrapeError
        ? err.message
        : "Could not scrape that URL. Try another product page.";
    return NextResponse.json({ error: message, ok: false }, { status: 422 });
  }
}
