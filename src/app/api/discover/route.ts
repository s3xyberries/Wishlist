import { NextResponse } from "next/server";
import { discoverLiveOffers } from "@/lib/scrape/discover";
import type { SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * User-initiated offer discovery (Amazon / eBay / generic).
 * POST JSON: { product: SearchResult, productId?: string }
 */
export async function POST(request: Request) {
  let body: { product?: SearchResult; productId?: string };
  try {
    body = (await request.json()) as { product?: SearchResult; productId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const product = body.product;
  if (!product?.title) {
    return NextResponse.json({ error: "product.title required" }, { status: 400 });
  }

  const result = await discoverLiveOffers(product, body.productId);
  return NextResponse.json(result);
}

/** Convenience GET for quick checks: /api/discover?title=...&price=... */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "";
  if (!title.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  const price = Number.parseFloat(searchParams.get("price") ?? "0") || 0;
  const product: SearchResult = {
    id: "discover-q",
    title,
    imageUrl:
      "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: price,
    currency: "USD",
    merchantHint: "User query",
    sourceHint: "shopping",
  };
  const result = await discoverLiveOffers(product);
  return NextResponse.json(result);
}
