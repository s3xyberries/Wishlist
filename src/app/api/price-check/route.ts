import { NextResponse } from "next/server";
import { fetchAmazonPrice } from "@/lib/scrape/amazon";
import { fetchEbayPrice } from "@/lib/scrape/ebay";
import type { SourceId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PriceCheckBody {
  sourceId: SourceId;
  url: string;
  fallbackPrice: number;
  currency?: string;
}

/**
 * User-initiated single-offer price refresh.
 * Never scheduled — only when the client asks.
 */
export async function POST(request: Request) {
  let body: PriceCheckBody;
  try {
    body = (await request.json()) as PriceCheckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceId, url, fallbackPrice, currency = "USD" } = body;
  if (!sourceId || !url || typeof fallbackPrice !== "number") {
    return NextResponse.json(
      { error: "sourceId, url, and fallbackPrice required" },
      { status: 400 },
    );
  }

  if (sourceId === "amazon") {
    const result = await fetchAmazonPrice(url, fallbackPrice, currency);
    return NextResponse.json(result);
  }
  if (sourceId === "ebay") {
    const result = await fetchEbayPrice(url, fallbackPrice, currency);
    return NextResponse.json(result);
  }

  // Generic: no live fetch yet
  const wobble = Math.round(fallbackPrice * (0.97 + (fallbackPrice % 7) * 0.002) * 100) / 100;
  return NextResponse.json({
    price: wobble,
    currency,
    mode: "stub",
    note: "Generic URL price check remains stubbed.",
  });
}
