import { NextResponse } from "next/server";
import { discoverLiveOffers } from "@/lib/scrape/discover";
import { upsertTrackedOffers } from "@/lib/scheduler/tracked-offers";
import { regionFromRequest, parseRegionId } from "@/lib/region/server";
import { getRegion } from "@/lib/region/config";
import type { SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * User-initiated offer discovery (Amazon / eBay / generic) for the active region.
 * POST JSON: { product: SearchResult, productId?: string, region?: string }
 */
export async function POST(request: Request) {
  let body: {
    product?: SearchResult;
    productId?: string;
    region?: string;
  };
  try {
    body = (await request.json()) as {
      product?: SearchResult;
      productId?: string;
      region?: string;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const product = body.product;
  if (!product?.title) {
    return NextResponse.json({ error: "product.title required" }, { status: 400 });
  }

  const region = body.region
    ? getRegion(parseRegionId(body.region))
    : await regionFromRequest(request);

  const result = await discoverLiveOffers(product, body.productId, region);

  if (result.offers?.length) {
    await upsertTrackedOffers(
      result.offers.map((o) => ({
        id: o.id,
        region: region.id,
        sourceId: o.sourceId,
        url: o.url,
        title: o.title,
        merchant: o.merchant,
        currency: o.currency,
        lastPrice: o.lastPrice,
        lastCheckedAt: o.lastCheckedAt,
        productId: o.productId,
        productTitle: product.title,
        notifyEnabled: true,
      })),
    );
  }

  return NextResponse.json(result);
}

/** Convenience GET for quick checks: /api/discover?title=...&price=...&region=au */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "";
  if (!title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const region = await regionFromRequest(request);
  const price = Number.parseFloat(searchParams.get("price") ?? "0") || 0;
  const product: SearchResult = {
    id: "discover-q",
    title,
    imageUrl:
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: price,
    currency: region.currency,
    merchantHint: "User query",
    sourceHint: "shopping",
  };
  const result = await discoverLiveOffers(product, undefined, region);
  return NextResponse.json(result);
}
