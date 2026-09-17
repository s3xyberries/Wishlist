import {
  candidatesToOffers,
  type OfferCandidate,
} from "@/lib/adapters";
import type { Offer, SearchResult } from "@/lib/types";
import { discoverAmazonOffer } from "./amazon";
import { discoverEbayOffer } from "./ebay";
import { discoverGenericOffer } from "./official";

export interface LiveDiscoverResponse {
  candidates: OfferCandidate[];
  offers?: Offer[];
  modes: {
    amazon: string;
    ebay: string;
    generic: string;
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
  const [amazon, ebay, generic] = await Promise.all([
    discoverAmazonOffer(product),
    discoverEbayOffer(product),
    discoverGenericOffer(product),
  ]);
  const candidates = [amazon.candidate, ebay.candidate, generic.candidate];
  const notes = [amazon.note, ebay.note, generic.note];

  const payload: LiveDiscoverResponse = {
    candidates,
    modes: {
      amazon: amazon.mode,
      ebay: ebay.mode,
      generic: generic.mode,
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
