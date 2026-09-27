import { NextResponse } from "next/server";
import { CatalogUnavailableError } from "@/lib/catalog/errors";
import {
  addWatchedPage,
  deleteWatchedPage,
  listWatchedPages,
  refreshWatchedPage,
} from "@/lib/pages/store";
import { regionFromRequest } from "@/lib/region/server";
import { ScrapeError } from "@/lib/scrape/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function errorMessage(err: unknown): string {
  if (err instanceof ScrapeError || err instanceof CatalogUnavailableError) {
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Could not update saved pages.";
}

export async function GET(request: Request) {
  try {
    const region = await regionFromRequest(request);
    const pages = await listWatchedPages(region.id);
    return NextResponse.json({
      region: region.id,
      currency: region.currency,
      pages,
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let body: { url?: string; label?: string; id?: string; action?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const region = await regionFromRequest(request);
    if (body.action === "refresh") {
      if (!body.id?.trim()) {
        return NextResponse.json({ error: "Page id is required" }, { status: 400 });
      }
      const page = await refreshWatchedPage(body.id.trim());
      if (page.region !== region.id) {
        return NextResponse.json({ error: "Saved page not found" }, { status: 404 });
      }
      return NextResponse.json({ page });
    }

    const page = await addWatchedPage({
      url: body.url ?? "",
      label: body.label,
      region,
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (err) {
    const status = err instanceof ScrapeError ? 422 : 500;
    return NextResponse.json({ error: errorMessage(err) }, { status });
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "Page id is required" }, { status: 400 });
  }
  try {
    const region = await regionFromRequest(request);
    const removed = await deleteWatchedPage(id, region.id);
    if (!removed) {
      return NextResponse.json({ error: "Saved page not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
