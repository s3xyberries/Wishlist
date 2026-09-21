/**
 * Headless Chromium fallback for Google Shopping when plain HTTP gets a JS shell.
 * Playwright is lazy-imported so normal HTTP scrapes stay fast.
 */
import type { RegionConfig } from "@/lib/region/config";
import type { SearchResult } from "@/lib/types";
import {
  classifyGoogleHtml,
  parseGoogleShoppingHtml,
  type GoogleBlockKind,
} from "./google-shopping";
import { parseMoney, ScrapeError } from "./http";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=400&h=400&q=80";

const BROWSER_TIMEOUT_MS = 20_000;
const NAV_TIMEOUT_MS = 16_000;

export type BrowserScrapeResult = {
  results: SearchResult[];
  googleStatus: GoogleBlockKind;
  note: string;
};

function shoppingUrl(query: string, region: RegionConfig): string {
  const host = region.id === "au" ? "www.google.com.au" : "www.google.com";
  const q = encodeURIComponent(query);
  return `https://${host}/search?udm=28&hl=${encodeURIComponent(region.googleHl)}&gl=${encodeURIComponent(region.googleGl)}&pws=0&q=${q}`;
}

function acceptLanguage(region: RegionConfig): string {
  return region.id === "au" ? "en-AU,en;q=0.9" : "en-US,en;q=0.9";
}

type DomHit = {
  title: string;
  priceText: string;
  merchant: string;
  imageUrl: string;
  href: string;
};

/** Extract product-ish cards from a live rendered Shopping page. */
function extractHitsInPage(): DomHit[] {
  const out: DomHit[] = [];
  const seen = new Set<string>();
  const roots = Array.from(
    document.querySelectorAll(
      "div.sh-dgr__grid-result, div.sh-dgr__content, div[data-docid], div.i0X6kf, div.u30d4, div.shntKv, div.MzEjW",
    ),
  );

  const push = (hit: DomHit) => {
    const key = hit.title.toLowerCase();
    if (!hit.title || hit.title.length < 4 || seen.has(key)) return;
    if (!/\$|A\$|AU\$|USD|AUD|\d/.test(hit.priceText)) return;
    seen.add(key);
    out.push(hit);
  };

  for (const root of roots) {
    if (out.length >= 12) break;
    const titleEl =
      root.querySelector("h3, h4") ||
      root.querySelector("a[aria-label]") ||
      root.querySelector(".tAxDx, .EI11pd, .xFAlLc");
    const title =
      (titleEl?.textContent || "").trim() ||
      titleEl?.getAttribute("aria-label")?.trim() ||
      "";
    const priceEl =
      root.querySelector("span.a8Pemb, span.HRLxBb, b.PZPZlf") ||
      Array.from(root.querySelectorAll("span")).find((s) =>
        /\$[\d,.]+/.test(s.textContent || ""),
      );
    const priceText =
      (priceEl?.textContent || "").trim() ||
      (root.textContent || "").match(/\$[\d,.]+/)?.[0] ||
      "";
    const merchant =
      (
        root.querySelector("div.aULzUe, span.IuHnof, div.O8U6h, div.WJMUdc")
          ?.textContent || ""
      ).trim() || "Google Shopping";
    const img =
      root.querySelector("img")?.getAttribute("src") ||
      root.querySelector("img")?.getAttribute("data-src") ||
      "";
    const link =
      (
        root.querySelector('a[href*="/shopping/product/"]') as HTMLAnchorElement | null
      )?.href ||
      (root.querySelector("a[href]") as HTMLAnchorElement | null)?.href ||
      "";
    push({ title, priceText, merchant, imageUrl: img, href: link });
  }

  // Broader fallback: any heading near a $-price in shopping layout
  if (out.length === 0) {
    for (const h of Array.from(document.querySelectorAll("h3, h4"))) {
      if (out.length >= 12) break;
      const block = h.closest("div") || h.parentElement;
      if (!block) continue;
      const text = block.textContent || "";
      const priceMatch = text.match(/(?:A\$|AU\$|US\$|\$)\s*[\d,]+(?:\.\d{2})?/);
      if (!priceMatch) continue;
      const title = (h.textContent || "").trim();
      const link =
        (block.querySelector("a[href]") as HTMLAnchorElement | null)?.href || "";
      const img =
        block.querySelector("img")?.getAttribute("src") ||
        block.querySelector("img")?.getAttribute("data-src") ||
        "";
      push({
        title,
        priceText: priceMatch[0],
        merchant: "Google Shopping",
        imageUrl: img,
        href: link,
      });
    }
  }

  return out;
}

function mapHits(
  hits: DomHit[],
  region: RegionConfig,
): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  hits.forEach((hit, index) => {
    const title = hit.title.trim();
    const price = parseMoney(hit.priceText);
    if (!title || price == null || price <= 0) return;
    const key = title.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      id: `gplay-${region.id}-${index}-${Buffer.from(title).toString("base64url").slice(0, 12)}`,
      title,
      imageUrl:
        hit.imageUrl.startsWith("http") ? hit.imageUrl : PLACEHOLDER_IMAGE,
      priceSnippet: price,
      currency: region.currency,
      merchantHint: (hit.merchant || "Google Shopping").slice(0, 80),
      sourceHint: "shopping",
      productUrl: hit.href.startsWith("http") ? hit.href : undefined,
    });
  });
  return results.slice(0, 12);
}

function shouldTryBrowser(status: GoogleBlockKind | undefined): boolean {
  return (
    status === "js_required" ||
    status === "captcha" ||
    status === "empty" ||
    status === "parse" ||
    status === "blocked" ||
    status === "consent" ||
    status === "unavailable"
  );
}

export { shouldTryBrowser };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Open Google Shopping in headless Chromium, wait for cards, extract products.
 * Throws ScrapeError with a clear message if Playwright/Chromium is missing.
 */
export async function searchGoogleShoppingViaBrowser(
  query: string,
  region: RegionConfig,
): Promise<BrowserScrapeResult> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new ScrapeError(
      "Playwright is not installed. Run: npm install && npx playwright install chromium",
      undefined,
      "playwright_missing",
    );
  }

  const url = shoppingUrl(query, region);
  let browser: import("playwright").Browser | null = null;

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new ScrapeError(
        "Playwright Chromium is missing. Run: npx playwright install chromium (or double-click update.bat).",
        undefined,
        "playwright_chromium_missing",
      );
    }
    throw new ScrapeError(
      `Could not launch Chromium for Google Shopping: ${msg}`,
      undefined,
      "playwright_launch_failed",
    );
  }

  const deadline = Date.now() + BROWSER_TIMEOUT_MS;

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: region.id === "au" ? "en-AU" : "en-US",
      viewport: { width: 1365, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": acceptLanguage(region),
      },
    });

    await context.addCookies([
      {
        name: "CONSENT",
        value: "YES+cb.20210407-17-p0.en+FX+987",
        domain: ".google.com",
        path: "/",
      },
      {
        name: "SOCS",
        value: "CAESHAgBEhJnd3NfMjAyNDA1MjMtMF9SQzIaAmVuIAEaBgiA_LmwBg",
        domain: ".google.com",
        path: "/",
      },
      {
        name: "CONSENT",
        value: "YES+cb.20210407-17-p0.en+FX+987",
        domain: ".google.com.au",
        path: "/",
      },
      {
        name: "SOCS",
        value: "CAESHAgBEhJnd3NfMjAyNDA1MjMtMF9SQzIaAmVuIAEaBgiA_LmwBg",
        domain: ".google.com.au",
        path: "/",
      },
    ]);

    const page = await context.newPage();
    page.setDefaultTimeout(Math.max(5_000, deadline - Date.now()));

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: Math.min(NAV_TIMEOUT_MS, Math.max(5_000, deadline - Date.now())),
    });

    // Dismiss consent dialog if it still appears
    try {
      const consent = page
        .locator(
          'button:has-text("Accept all"), button:has-text("I agree"), button:has-text("Accept")',
        )
        .first();
      if (await consent.isVisible({ timeout: 2_000 })) {
        await consent.click({ timeout: 2_000 });
        await sleep(800);
      }
    } catch {
      // no consent UI
    }

    // Wait for shopping cards or give up when captcha/shell remains
    try {
      await Promise.race([
        page.waitForSelector(
          "div.sh-dgr__grid-result, div[data-docid], span.a8Pemb, h3",
          { timeout: Math.min(12_000, Math.max(3_000, deadline - Date.now())) },
        ),
        sleep(8_000),
      ]);
    } catch {
      // continue to classify whatever we got
    }

    const html = await page.content();
    const kind = classifyGoogleHtml(html);
    if (kind === "captcha" || kind === "js_required") {
      return {
        results: [],
        googleStatus: kind,
        note:
          kind === "captcha"
            ? "Headless browser still hit Google captcha / unusual traffic."
            : "Headless browser still received Google’s JavaScript-only shell.",
      };
    }

    let hits = await page.evaluate(extractHitsInPage);
    let results = mapHits(hits, region);
    if (!results.length) {
      results = parseGoogleShoppingHtml(html, region);
    }

    if (results.length) {
      return {
        results,
        googleStatus: "ok",
        note: `Live Google Shopping via headless Chromium (${region.shortLabel}, gl=${region.googleGl}).`,
      };
    }

    return {
      results: [],
      googleStatus: kind === "ok" ? "empty" : kind,
      note: "Headless browser loaded Google Shopping but found no product cards.",
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
