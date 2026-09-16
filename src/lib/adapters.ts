import type { Offer, Product, SearchResult, SourceId } from "./types";

export interface OfferCandidate {
  sourceId: SourceId;
  title: string;
  url: string;
  merchant: string;
  currency: string;
  price: number;
  /** Slightly wrong match used to demo dismiss/filter UX */
  suspect?: boolean;
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
}

function jitter(base: number, pct: number) {
  return Math.round(base * (1 + pct) * 100) / 100;
}

/** Amazon stub — maps product identity to a seeded offer. No live scrape. */
export function amazonDiscover(product: SearchResult): OfferCandidate {
  return {
    sourceId: "amazon",
    title: product.title,
    url: `https://www.amazon.com/s?k=${encodeURIComponent(product.title)}`,
    merchant: "Amazon.com",
    currency: product.currency,
    price: jitter(product.priceSnippet, -0.03),
  };
}

/** eBay stub — often a marketplace variant / used listing for demo. */
export function ebayDiscover(product: SearchResult): OfferCandidate {
  return {
    sourceId: "ebay",
    title: `${product.title} — Open Box`,
    url: `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(product.title)}`,
    merchant: "eBay",
    currency: product.currency,
    price: jitter(product.priceSnippet, -0.12),
  };
}

/** Generic retailer path — placeholder third-party match (user can dismiss). */
export function genericDiscover(product: SearchResult): OfferCandidate {
  const slug = slugify(product.title);
  return {
    sourceId: "generic",
    title: `${product.brand ?? "Store"} Marketplace listing for similar item`,
    url: `https://example-retailer.example/p/${slug}`,
    merchant: "Example Retailer",
    currency: product.currency,
    price: jitter(product.priceSnippet, 0.08),
    suspect: true,
  };
}

export function discoverOffers(product: SearchResult): OfferCandidate[] {
  return [amazonDiscover(product), ebayDiscover(product), genericDiscover(product)];
}

export function candidatesToOffers(
  productId: string,
  candidates: OfferCandidate[],
  checkedAt: string,
): Offer[] {
  return candidates.map((c, index) => ({
    id: `${productId}-${c.sourceId}-${index}`,
    productId,
    sourceId: c.sourceId,
    title: c.title,
    url: c.url,
    merchant: c.merchant,
    currency: c.currency,
    status: c.suspect ? "suspected_mismatch" : "active",
    lastPrice: c.price,
    lastCheckedAt: checkedAt,
  }));
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  generic: "Generic URL",
};

export function productFromResult(
  result: SearchResult,
  queryText: string,
  now: string,
): Product {
  return {
    id: `prod-${result.id}-${Date.now().toString(36)}`,
    title: result.title,
    brand: result.brand,
    imageUrl: result.imageUrl,
    queryText,
    createdAt: now,
    notifyEnabled: true,
  };
}
