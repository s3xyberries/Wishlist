/**
 * Polite, user-triggered HTTP helpers for light discovery/price fetches.
 * Not for cron or bulk scraping — callers must be request-driven.
 */

/** Browser-like UA — many retailers 403 custom bot UAs. */
export const PRICEKEEP_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 10_000;
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
  /** Machine-readable reason (e.g. google_captcha, google_js_required). */
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ScrapeError";
    this.status = status;
    this.code = code;
  }
}

export interface FetchHtmlOptions {
  timeoutMs?: number;
  minIntervalMs?: number;
  cacheTtlMs?: number;
  accept?: string;
  /** Skip cache read/write (still rate-limited). */
  bypassCache?: boolean;
  /** Merged onto default browser-like headers (e.g. Cookie, Accept-Language). */
  extraHeaders?: Record<string, string>;
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
        Accept:
          options.accept ??
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
        ...(options.extraHeaders ?? {}),
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

/** Token overlap score for picking the right SKU from noisy search pages. */
export function titleMatchScore(query: string, title: string): number {
  const qTokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  const titleLower = title.toLowerCase();
  if (!qTokens.length) return 0;

  let score = 0;
  for (const t of qTokens) {
    if (titleLower.includes(t)) score += t.length >= 3 ? 3 : 1;
  }

  // Exact model-ish tokens (letters+digits) are decisive — H2S vs P2S.
  for (const t of qTokens) {
    if (/^[a-z]*\d+[a-z]*$/i.test(t)) {
      if (titleLower.includes(t)) score += 12;
      else score -= 8;
    }
  }

  // Accessories / aftermarket that merely mention the model.
  if (
    /\b(nozzle|hotend|build plate|pei plate|filter|protector|holder|stand|filament|sleeve|screen protector|cryogrip|plate|ams\b(?!\s*2\s*pro)|perch|den h2)\b/i.test(
      title,
    )
  ) {
    score -= 25;
  }
  if (/\b(for|compatible with|fit for|fits)\s+bambu\b/i.test(titleLower)) {
    score -= 20;
  }
  // Model buried in a long compatibility list (H2D/H2S/H2C/…)
  if ((title.match(/\//g) || []).length >= 2 && /h2[sdc]/i.test(titleLower)) {
    score -= 10;
  }

  // Prefer primary product language and leading brand+model.
  if (/\b3d\s*printer\b/i.test(title)) score += 6;
  const qCore = qTokens.slice(0, 3).join(" ");
  if (qCore && titleLower.startsWith(qCore.slice(0, Math.min(12, qCore.length)))) {
    score += 8;
  }
  if (/^bambu lab h2s\b/i.test(title.trim())) score += 20;

  return score;
}

/** True when marketplace title looks like an accessory, not the main SKU. */
export function looksLikeAccessory(title: string): boolean {
  return (
    titleMatchScore("primary product", title) < 0 ||
    /\b(nozzle|hotend|build plate|pei|filter|protector|holder|stand|filament|sleeve|screen protector|compatible with|fit for)\b/i.test(
      title,
    ) ||
    /\bfor bambu\b/i.test(title)
  );
}

export function clearScrapeCaches() {
  responseCache.clear();
  lastRequestAt.clear();
}
