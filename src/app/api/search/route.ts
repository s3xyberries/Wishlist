import { NextResponse } from "next/server";
import { searchWithCatalog } from "@/lib/catalog/search";
import { CatalogUnavailableError } from "@/lib/catalog/db";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorPayload(
  region: { id: string; currency: string },
  err: unknown,
  httpStatus = 500,
) {
  const message =
    err instanceof CatalogUnavailableError
      ? err.message
      : err instanceof Error
        ? err.message
        : "Search scrape failed unexpectedly.";
  return NextResponse.json(
    {
      results: [],
      mode: "error",
      note: message,
      error: message,
      origin: "scrape",
      region: region.id,
      currency: region.currency,
      httpStatus,
    },
    { status: httpStatus },
  );
}

export async function GET(request: Request) {
  let region;
  try {
    region = await regionFromRequest(request);
  } catch (err) {
    return errorPayload({ id: "au", currency: "AUD" }, err, 500);
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const forceRefresh =
    searchParams.get("refresh") === "1" ||
    searchParams.get("refresh") === "true" ||
    searchParams.get("force") === "1";

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
  } catch (err) {
    return errorPayload(region, err, 500);
  }
}
