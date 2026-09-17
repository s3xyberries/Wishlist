import { NextResponse } from "next/server";
import { searchProducts } from "@/lib/scrape/google-shopping";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  if (!q.trim()) {
    return NextResponse.json({ results: [], mode: "empty", note: "Empty query." });
  }

  try {
    const payload = await searchProducts(q);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({
      results: [],
      mode: "error",
      note: "Search scrape failed unexpectedly.",
    });
  }
}
