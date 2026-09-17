/**
 * Polite, user-triggered HTTP helpers for light discovery/price fetches.
 * Not for cron or bulk scraping — callers must be request-driven.
 */

export const PRICEKEEP_USER_AGENT =
  "Pricekeep/0.1 (+https://github.com/s3xyberries/Wishlist; personal wishlist; user-initiated)";

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MIN_INTERVAL_MS = 2_500;
const DEFAULT_CACHE_TTL_MS = 60_000;

type CacheEntry = { body: string; status: number; expiresAt: number };

const lastRequestAt = new Map<string, number>();
const responseCache = new Map<string, CacheEntry>();

function hostKey(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "unknown";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ScrapeError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
  }
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  minIntervalMs?: number;
  cacheTtlMs?: number;
  accept?: string;
  /** Skip cache read/write (still rate-limited). */
  bypassCache?: boolean;
}

/**
 * Fetch HTML/text with timeout, polite User-Agent, per-host rate limit, and short cache.
 */
export async function fetchText(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<{ body: string; status: number; fromCache: boolean }> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const host = hostKey(url);
  const cacheKey = `GET:${url}`;

  if (!options.bypassCache) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { body: cached.body, status: cached.status, fromCache: true };
    }
  }

  const last = lastRequestAt.get(host) ?? 0;
  const wait = minIntervalMs - (Date.now() - last);
  if (wait > 0) await sleep(wait);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    lastRequestAt.set(host, Date.now());
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": PRICEKEEP_USER_AGENT,
        Accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.8",
        "Cache-Control": "no-cache",
      },
    });

    const body = await res.text();
    if (!options.bypassCache && res.ok) {
      responseCache.set(cacheKey, {
        body,
        status: res.status,
        expiresAt: Date.now() + cacheTtlMs,
      });
    }

    if (!res.ok) {
      throw new ScrapeError(`HTTP ${res.status} for ${host}`, res.status);
    }

    return { body, status: res.status, fromCache: false };
  } catch (err) {
    if (err instanceof ScrapeError) throw err;
    const message =
      err instanceof Error && err.name === "AbortError"
        ? `Timeout after ${timeoutMs}ms fetching ${host}`
        : err instanceof Error
          ? err.message
          : "Fetch failed";
    throw new ScrapeError(message);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchHtml(
  url: string,
  options: FetchHtmlOptions = {},
): Promise<{ html: string; status: number; fromCache: boolean }> {
  const { body, status, fromCache } = await fetchText(url, options);
  return { html: body, status, fromCache };
}

/** Parse a loose currency string like "$1,234.56" or "USD 99". */
export function parseMoney(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  // Prefer last comma/period as decimal when both present
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      normalized = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = cleaned.replace(/,/g, "");
    }
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    normalized =
      parts[parts.length - 1].length === 2
        ? `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`
        : cleaned.replace(/,/g, "");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

export function clearScrapeCaches() {
  responseCache.clear();
  lastRequestAt.clear();
}
