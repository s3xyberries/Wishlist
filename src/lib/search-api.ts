/** Client-only helper: always call the JSON search API (never a document URL). */

import { ensureLoopbackServiceWorkersCleared } from "@/lib/loopback-sw";

export type SearchApiPayload = {
  results?: unknown[];
  mode?: string;
  note?: string;
  error?: string;
  origin?: "catalog" | "scrape";
  stale?: boolean;
  catalogWarning?: string;
  region?: string;
  currency?: string;
};

export type SearchApiResult =
  | {
      ok: true;
      status: number;
      requestUrl: string;
      data: SearchApiPayload;
    }
  | {
      ok: false;
      status: number;
      requestUrl: string;
      rawPreview: string;
      contentType: string;
      reason: "html" | "non-json" | "http-error" | "network";
      message: string;
      data?: SearchApiPayload;
    };

/** Relative same-origin path — always matches the tab’s host (127.0.0.1). */
export function buildSearchApiPath(
  q: string,
  regionId: string,
  forceRefresh = false,
): string {
  const params = new URLSearchParams();
  params.set("q", q);
  params.set("region", regionId);
  if (forceRefresh) params.set("refresh", "1");
  return `/api/search?${params.toString()}`;
}

export async function fetchSearchApi(options: {
  q: string;
  regionId: string;
  forceRefresh?: boolean;
}): Promise<SearchApiResult> {
  // Stale service workers on loopback can turn /api failures into Firefox NetworkError.
  await ensureLoopbackServiceWorkersCleared();

  const requestUrl = buildSearchApiPath(
    options.q,
    options.regionId,
    Boolean(options.forceRefresh),
  );

  let res: Response;
  try {
    res = await fetch(requestUrl, {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "x-pricekeep-region": options.regionId,
      },
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      requestUrl,
      rawPreview: "",
      contentType: "",
      reason: "network",
      message: `Could not reach ${requestUrl}: ${detail}. Leave the run.bat window open on http://127.0.0.1:43127, hard-refresh once, then try again. If it keeps failing, check that console for a server crash and restart run.bat.`,
    };
  }

  const contentType = res.headers.get("content-type") ?? "";
  const rawText = await res.text();
  const looksHtml =
    contentType.includes("text/html") || /^\s*<(!DOCTYPE|html)/i.test(rawText);

  if (looksHtml) {
    return {
      ok: false,
      status: res.status,
      requestUrl,
      rawPreview: rawText.slice(0, 180),
      contentType,
      reason: "html",
      message: `Search expected JSON but got HTML (HTTP ${res.status}) from ${requestUrl}. Hard-refresh (Ctrl+Shift+R) on http://127.0.0.1:43127.`,
    };
  }

  let data: SearchApiPayload = {};
  try {
    data = rawText ? (JSON.parse(rawText) as SearchApiPayload) : {};
  } catch {
    return {
      ok: false,
      status: res.status,
      requestUrl,
      rawPreview: rawText.slice(0, 180),
      contentType,
      reason: "non-json",
      message: `Search API returned HTTP ${res.status} (non-JSON) from ${requestUrl}. ${rawText.slice(0, 120) || "Empty body."}`,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      requestUrl,
      rawPreview: rawText.slice(0, 180),
      contentType,
      reason: "http-error",
      message:
        data.error ||
        data.note ||
        `Search API failed (HTTP ${res.status}) from ${requestUrl}.`,
      data,
    };
  }

  return { ok: true, status: res.status, requestUrl, data };
}
