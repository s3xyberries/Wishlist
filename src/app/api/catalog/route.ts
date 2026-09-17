import { NextResponse } from "next/server";
import { catalogDbPath } from "@/lib/catalog/db";
import { listCatalog } from "@/lib/catalog/store";
import { CATALOG_TTL_MS } from "@/lib/catalog/types";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";

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
      note:
        payload.totalProducts === 0
          ? `${region.shortLabel} shared catalog is empty. Search a product to scrape and save it.`
          : `${region.shortLabel} catalog has ${payload.totalProducts} product${payload.totalProducts === 1 ? "" : "s"} (${region.currency}). Fresh for ${Math.round(CATALOG_TTL_MS / 3_600_000)} hours.`,
    });
  } catch {
    return NextResponse.json(
      {
        products: [],
        queries: [],
        totalProducts: 0,
        updatedAt: null,
        region: region.id,
        currency: region.currency,
        ttlMs: CATALOG_TTL_MS,
        note: "Could not read shared catalog.",
      },
      { status: 500 },
    );
  }
}
