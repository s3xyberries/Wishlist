/** Client-only helper: always call the JSON search API (never a document URL). */

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

export function buildSearchApiUrl(
  origin: string,
  q: string,
  regionId: string,
  forceRefresh = false,
): string {
  const url = new URL("/api/search", origin);
  url.searchParams.set("q", q);
  url.searchParams.set("region", regionId);
  if (forceRefresh) url.searchParams.set("refresh", "1");
  return url.toString();
}

export async function fetchSearchApi(options: {
  origin: string;
  q: string;
  regionId: string;
  forceRefresh?: boolean;
}): Promise<SearchApiResult> {
  const requestUrl = buildSearchApiUrl(
    options.origin,
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
    return {
      ok: false,
      status: 0,
      requestUrl,
      rawPreview: "",
      contentType: "",
      reason: "network",
      message:
        err instanceof Error
          ? `Could not reach ${requestUrl}: ${err.message}`
          : `Could not reach ${requestUrl}. Is the Next.js server running?`,
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
      message: `Search expected JSON but got HTML (HTTP ${res.status}) from ${requestUrl}. Hard-refresh (Ctrl+Shift+R) or unregister the service worker for this origin, then try again.`,
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
