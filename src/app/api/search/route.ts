import { NextResponse } from "next/server";
import { searchMockCatalog } from "@/lib/mock-catalog";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  // Live Google Shopping / SerpAPI would go here when a key is present.
  const hasKey = Boolean(
    process.env.GOOGLE_SHOPPING_API_KEY ||
      process.env.SERPAPI_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_SHOPPING_API_KEY,
  );

  // Artificial latency so loading state is visible in the UI.
  await new Promise((r) => setTimeout(r, 350));

  if (!q.trim()) {
    return NextResponse.json({ results: [], mode: "mock" });
  }

  const results = searchMockCatalog(q);
  return NextResponse.json({
    results,
    mode: hasKey ? "live-unavailable-fallback-mock" : "mock",
    note: hasKey
      ? "API key detected but live provider not wired yet — returning mock catalog."
      : "No shopping API key — using local mock catalog.",
  });
}
