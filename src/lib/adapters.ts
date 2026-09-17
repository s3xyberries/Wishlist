import type { Offer, Product, SearchResult, SourceId } from "./types";

export interface OfferCandidate {
  sourceId: SourceId;
  title: string;
  url: string;
  merchant: string;
  currency: string;
  price: number;
  suspect?: boolean;
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
  generic: "Official / generic URL",
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
