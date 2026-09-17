import { NextResponse } from "next/server";
import { fetchAmazonPrice } from "@/lib/scrape/amazon";
import { fetchEbayPrice } from "@/lib/scrape/ebay";
import { fetchOfficialOrGenericPrice } from "@/lib/scrape/official";
import type { SourceId } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PriceCheckBody {
  sourceId: SourceId;
  url: string;
  currency?: string;
}

/**
 * User-initiated single-offer price refresh — live scrape/API only.
 */
export async function POST(request: Request) {
  let body: PriceCheckBody;
  try {
    body = (await request.json()) as PriceCheckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { sourceId, url, currency = "USD" } = body;
  if (!sourceId || !url) {
    return NextResponse.json(
      { error: "sourceId and url required" },
      { status: 400 },
    );
  }

  if (sourceId === "amazon") {
    const result = await fetchAmazonPrice(url, currency);
    return NextResponse.json(result);
  }
  if (sourceId === "ebay") {
    const result = await fetchEbayPrice(url, currency);
    return NextResponse.json(result);
  }

  const result = await fetchOfficialOrGenericPrice(url, currency);
  return NextResponse.json(result);
}
