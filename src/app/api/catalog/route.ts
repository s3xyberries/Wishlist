import { NextResponse } from "next/server";
import { catalogDbPath, CATALOG_DRIVER } from "@/lib/catalog/db";
import { CatalogUnavailableError } from "@/lib/catalog/errors";
import { listCatalog } from "@/lib/catalog/store";
import { CATALOG_TTL_MS } from "@/lib/catalog/types";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? undefined;
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 40;
  const region = await regionFromRequest(request);

  try {
    const payload = await listCatalog({
      q,
      region: region.id,
      limit: Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 40,
    });
    return NextResponse.json({
      ...payload,
      ttlMs: CATALOG_TTL_MS,
      currency: region.currency,
      dbPath: catalogDbPath(),
      driver: CATALOG_DRIVER,
      note:
        payload.totalProducts === 0
          ? `${region.shortLabel} shared catalog is empty. Search a product to scrape and save it.`
          : `${region.shortLabel} catalog has ${payload.totalProducts} product${payload.totalProducts === 1 ? "" : "s"} (${region.currency}). Fresh for ${Math.round(CATALOG_TTL_MS / 3_600_000)} hours.`,
    });
  } catch (err) {
    const message =
      err instanceof CatalogUnavailableError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Could not read shared catalog.";
    return NextResponse.json(
      {
        products: [],
        queries: [],
        totalProducts: 0,
        updatedAt: null,
        region: region.id,
        currency: region.currency,
        ttlMs: CATALOG_TTL_MS,
        driver: CATALOG_DRIVER,
        error: message,
        note: message,
      },
      { status: err instanceof CatalogUnavailableError ? 503 : 500 },
    );
  }
}
