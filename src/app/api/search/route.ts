import { NextResponse } from "next/server";
import { searchWithCatalog } from "@/lib/catalog/search";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
    });
  }

  try {
    const payload = await searchWithCatalog(q, { forceRefresh });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({
      results: [],
      mode: "error",
      note: "Search scrape failed unexpectedly.",
      origin: "scrape",
    });
  }
}
