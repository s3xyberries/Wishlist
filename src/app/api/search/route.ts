import { NextResponse } from "next/server";
import { CatalogUnavailableError } from "@/lib/catalog/db";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Soft ceiling so hung scrapes return JSON instead of dropping the TCP connection. */
export const maxDuration = 60;

const SEARCH_BUDGET_MS = 50_000;

function json(
  body: Record<string, unknown>,
  init?: { status?: number },
) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

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
  return json(
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
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
    return json({
      results: [],
      mode: "empty",
      note: "Empty query.",
      origin: "catalog",
      region: region.id,
      currency: region.currency,
    });
  }

  try {
    // Dynamic import so a catalog/native-module failure still returns JSON.
    const { searchWithCatalog } = await import("@/lib/catalog/search");
    const payload = await withTimeout(
      searchWithCatalog(q, region, { forceRefresh }),
      SEARCH_BUDGET_MS,
      "Search",
    );
    return json(payload as unknown as Record<string, unknown>);
  } catch (err) {
    return errorPayload(region, err, 500);
  }
}
