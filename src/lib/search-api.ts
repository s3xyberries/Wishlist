/** Client-only helper: always call the JSON search API (never a document URL). */

import { nukeServiceWorkers } from "@/lib/loopback-sw";

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
  googleStatus?: string;
  googleNote?: string;
};

export type SearchApiResult =
  | {
      ok: true;
      status: number;
      requestUrl: string;
      data: SearchApiPayload;
      pingOk?: boolean;
    }
  | {
      ok: false;
      status: number;
      requestUrl: string;
      rawPreview: string;
      contentType: string;
      reason: "html" | "non-json" | "http-error" | "network" | "timeout" | "server-down";
      message: string;
      data?: SearchApiPayload;
      pingOk?: boolean;
    };

const SEARCH_TIMEOUT_MS = 55_000;
const PING_TIMEOUT_MS = 4_000;

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

async function fetchJsonRelative(
  path: string,
  init: RequestInit & { timeoutMs: number },
): Promise<{ res: Response; text: string; contentType: string }> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    const res = await fetch(path, {
      method: "GET",
      cache: "no-store",
      // Explicit same-origin — avoids CORS mode quirks in Firefox.
      mode: "same-origin",
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    return { res, text, contentType };
  } finally {
    window.clearTimeout(timer);
  }
}

async function pingServer(): Promise<boolean> {
  try {
    const { res, text, contentType } = await fetchJsonRelative("/api/ping", {
      timeoutMs: PING_TIMEOUT_MS,
    });
    if (!res.ok) return false;
    if (!contentType.includes("application/json")) return false;
    const data = JSON.parse(text) as { ok?: boolean; ping?: boolean };
    return Boolean(data.ok && data.ping);
  } catch {
    return false;
  }
}

export async function fetchSearchApi(options: {
  q: string;
  regionId: string;
  forceRefresh?: boolean;
}): Promise<SearchApiResult> {
  // Every search: aggressively clear SWs (sticky Firefox workers → NetworkError).
  await nukeServiceWorkers();

  const requestUrl = buildSearchApiPath(
    options.q,
    options.regionId,
    Boolean(options.forceRefresh),
  );

  let res: Response;
  let rawText: string;
  let contentType: string;
  try {
    const out = await fetchJsonRelative(requestUrl, {
      timeoutMs: SEARCH_TIMEOUT_MS,
      headers: { "x-pricekeep-region": options.regionId },
    });
    res = out.res;
    rawText = out.text;
    contentType = out.contentType;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const aborted =
      (err instanceof DOMException && err.name === "AbortError") ||
      /abort/i.test(detail);

    const pingOk = await pingServer();

    if (aborted) {
      return {
        ok: false,
        status: 0,
        requestUrl,
        rawPreview: "",
        contentType: "",
        reason: "timeout",
        pingOk,
        message: pingOk
          ? `Search timed out after ${Math.round(SEARCH_TIMEOUT_MS / 1000)}s at ${requestUrl} (server ping OK — scrape may be slow; try Force refresh or a simpler query).`
          : `Search timed out at ${requestUrl} and /api/ping also failed — the Node server may have hung. Check the run.bat window and restart it.`,
      };
    }

    return {
      ok: false,
      status: 0,
      requestUrl,
      rawPreview: "",
      contentType: "",
      reason: pingOk ? "network" : "server-down",
      pingOk,
      message: pingOk
        ? `Could not reach ${requestUrl}: ${detail}. Server /api/ping works, so this is likely a sticky browser worker or extension — hard-refresh (Ctrl+Shift+R) on http://127.0.0.1:43127, or try a private window with extensions disabled.`
        : `Could not reach ${requestUrl}: ${detail}. /api/ping also failed — leave run.bat open, confirm http://127.0.0.1:43127/api/ping shows JSON, then retry.`,
    };
  }

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
      message: `Search expected JSON but got HTML (HTTP ${res.status}) from ${requestUrl}. Hard-refresh on http://127.0.0.1:43127.`,
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
