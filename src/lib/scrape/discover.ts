import {
  candidatesToOffers,
  genericDiscover,
  type OfferCandidate,
} from "@/lib/adapters";
import type { Offer, SearchResult } from "@/lib/types";
import { discoverAmazonOffer } from "./amazon";
import { discoverEbayOffer } from "./ebay";

export interface LiveDiscoverResponse {
  candidates: OfferCandidate[];
  offers?: Offer[];
  modes: {
    amazon: string;
    ebay: string;
    generic: "stub";
  };
  notes: string[];
}

/**
 * Fan-out offer discovery for a confirmed product identity.
 * User-initiated only; each retailer path falls back to stubs.
 */
export async function discoverLiveOffers(
  product: SearchResult,
  productId?: string,
): Promise<LiveDiscoverResponse> {
  const [amazon, ebay] = await Promise.all([
    discoverAmazonOffer(product),
    discoverEbayOffer(product),
  ]);
  const generic = genericDiscover(product);
  const candidates = [amazon.candidate, ebay.candidate, generic];
  const notes = [amazon.note, ebay.note, "Generic retailer remains a stub match."];

  const payload: LiveDiscoverResponse = {
    candidates,
    modes: {
      amazon: amazon.mode,
      ebay: ebay.mode,
      generic: "stub",
    },
    notes,
  };

  if (productId) {
    payload.offers = candidatesToOffers(
      productId,
      candidates,
      new Date().toISOString(),
    );
  }

  return payload;
}
