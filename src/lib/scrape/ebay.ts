import * as cheerio from "cheerio";
import type { OfferCandidate } from "@/lib/adapters";
import type { SearchResult } from "@/lib/types";
import { fetchHtml, parseMoney, ScrapeError } from "./http";

export interface DiscoverResult {
  candidate: OfferCandidate | null;
  mode: "scrape" | "api" | "none";
  note: string;
}

export interface PriceFetchResult {
  price: number | null;
  currency: string;
  title?: string;
  mode: "scrape" | "api" | "none";
  note: string;
}

function hasEbayApi() {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

async function ebayAppToken(): Promise<string> {
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) throw new ScrapeError("Missing eBay API credentials");

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const env = (process.env.EBAY_ENV ?? "PRODUCTION").toUpperCase();
  const tokenHost =
    env === "SANDBOX"
      ? "https://api.sandbox.ebay.com/identity/v1/oauth2/token"
      : "https://api.ebay.com/identity/v1/oauth2/token";

  const res = await fetch(tokenHost, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new ScrapeError(`eBay OAuth HTTP ${res.status}`, res.status);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new ScrapeError("eBay OAuth missing token");
  return data.access_token;
}

async function discoverViaEbayApi(product: SearchResult): Promise<OfferCandidate> {
  const token = await ebayAppToken();
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", product.title);
  url.searchParams.set("limit", "3");

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new ScrapeError(`eBay Browse HTTP ${res.status}`, res.status);
  const data = (await res.json()) as {
    itemSummaries?: Array<{
      title?: string;
      itemWebUrl?: string;
      price?: { value?: string; currency?: string };
      seller?: { username?: string };
    }>;
  };
  const item = data.itemSummaries?.[0];
  if (!item?.title || !item.itemWebUrl) throw new ScrapeError("No eBay API items");
  const price = parseMoney(item.price?.value);
  if (price == null) throw new ScrapeError("eBay API item missing price");
  return {
    sourceId: "ebay",
    title: item.title,
    url: item.itemWebUrl,
    merchant: item.seller?.username ? `eBay · ${item.seller.username}` : "eBay",
    currency: item.price?.currency ?? product.currency ?? "USD",
    price,
  };
}

export async function discoverEbayOffer(
  product: SearchResult,
): Promise<DiscoverResult> {
  if (hasEbayApi()) {
    try {
      const candidate = await discoverViaEbayApi(product);
      return {
        candidate,
        mode: "api",
        note: "eBay Browse API search hit.",
      };
    } catch {
      // fall through to scrape
    }
  }

  try {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.title)}&_sacat=0&LH_BIN=1`;
    const { html } = await fetchHtml(url, { timeoutMs: 8_000, minIntervalMs: 3_000 });
    const lower = html.toLowerCase();
    if (
      lower.includes("captcha") ||
      lower.includes("security measure") ||
      html.length < 3_000
    ) {
      throw new ScrapeError("eBay search blocked");
    }

    const $ = cheerio.load(html);
    const first = $("li.s-item, li[data-viewport], .s-item")
      .filter((_, el) => {
        const t = $(el).find(".s-item__title, .s-item__title span").first().text();
        return Boolean(t && !/shop on ebay/i.test(t));
      })
      .first();

    if (!first.length) throw new ScrapeError("No eBay search results");

    const title =
      first.find(".s-item__title span[role='heading']").first().text().trim() ||
      first.find(".s-item__title").first().text().trim() ||
      product.title;
    const href = first.find("a.s-item__link").attr("href");
    if (!href) throw new ScrapeError("eBay result missing URL");
    const priceText =
      first.find(".s-item__price").first().text() ||
      first.find("[class*='price']").first().text();
    const price = parseMoney(priceText);
    if (price == null) throw new ScrapeError("eBay result missing price");

    return {
      candidate: {
        sourceId: "ebay",
        title,
        url: href.split("?")[0],
        merchant: "eBay",
        currency: product.currency || "USD",
        price,
      },
      mode: "scrape",
      note: "Parsed top eBay search hit.",
    };
  } catch {
    return {
      candidate: null,
      mode: "none",
      note: "eBay scrape/API unavailable.",
    };
  }
}

export async function fetchEbayPrice(
  url: string,
  currency = "USD",
): Promise<PriceFetchResult> {
  try {
    const { html } = await fetchHtml(url, { timeoutMs: 8_000, minIntervalMs: 3_000 });
    if (html.toLowerCase().includes("captcha") || html.length < 2_000) {
      throw new ScrapeError("eBay item page blocked");
    }
    const $ = cheerio.load(html);
    const title =
      $("h1.x-item-title__mainTitle span").first().text().trim() ||
      $("#itemTitle").text().replace(/^Details about\s+/i, "").trim() ||
      undefined;
    const priceText =
      $("div.x-price-primary span").first().text() ||
      $("#prcIsum").text() ||
      $("[itemprop='price']").attr("content") ||
      $("span[itemprop='price']").text() ||
      "";
    const price = parseMoney(priceText);
    if (price == null) throw new ScrapeError("No price on eBay page");
    return {
      price,
      currency,
      title,
      mode: "scrape",
      note: "Parsed eBay item price.",
    };
  } catch {
    return {
      price: null,
      currency,
      mode: "none",
      note: "eBay price scrape failed.",
    };
  }
}
