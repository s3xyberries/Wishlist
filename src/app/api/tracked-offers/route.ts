import { NextResponse } from "next/server";
import {
  deleteTrackedOffer,
  deleteTrackedOffersForProduct,
  upsertTrackedOffers,
} from "@/lib/scheduler/tracked-offers";
import { parseRegionId } from "@/lib/region/server";
import type { SourceId } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Register client wishlist offers so the daily scheduler can recheck them. */
export async function POST(request: Request) {
  let body: {
    region?: string;
    offers?: Array<{
      id: string;
      sourceId: SourceId;
      url: string;
      title: string;
      merchant: string;
      currency: string;
      lastPrice: number;
      lastCheckedAt: string;
      productId?: string;
      productTitle?: string;
      notifyEnabled?: boolean;
    }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const region = parseRegionId(body.region);
  const offers = (body.offers ?? []).map((o) => ({
    ...o,
    region,
    notifyEnabled: o.notifyEnabled !== false,
  }));

  upsertTrackedOffers(offers);
  return NextResponse.json({ ok: true, count: offers.length, region });
}

/** Remove tracked offer(s) from the scheduler store. */
export async function DELETE(request: Request) {
  let body: { offerId?: string; productId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.productId) {
    deleteTrackedOffersForProduct(body.productId);
    return NextResponse.json({ ok: true, removed: "product" });
  }
  if (body.offerId) {
    deleteTrackedOffer(body.offerId);
    return NextResponse.json({ ok: true, removed: "offer" });
  }
  return NextResponse.json(
    { error: "offerId or productId required" },
    { status: 400 },
  );
}
