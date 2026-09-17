import { NextResponse } from "next/server";
import { searchWithCatalog } from "@/lib/catalog/search";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const forceRefresh =
    searchParams.get("refresh") === "1" ||
    searchParams.get("refresh") === "true" ||
    searchParams.get("force") === "1";
  const region = await regionFromRequest(request);

  if (!q.trim()) {
    return NextResponse.json({
      results: [],
      mode: "empty",
      note: "Empty query.",
      origin: "catalog",
      region: region.id,
      currency: region.currency,
    });
  }

  try {
    const payload = await searchWithCatalog(q, region, { forceRefresh });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({
      results: [],
      mode: "error",
      note: "Search scrape failed unexpectedly.",
      origin: "scrape",
      region: region.id,
      currency: region.currency,
    });
  }
}
