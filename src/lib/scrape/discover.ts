import { candidatesToOffers, type OfferCandidate } from "@/lib/adapters";
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
 * Fan-out live offer discovery only — no stub/mock candidates.
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

  const paired = [
    { result: amazon, key: "amazon" as const },
    { result: ebay, key: "ebay" as const },
    { result: generic, key: "generic" as const },
  ];

  const candidates = paired
    .map((p) => p.result.candidate)
    .filter((c): c is OfferCandidate => c != null);

  const payload: LiveDiscoverResponse = {
    candidates,
    modes: {
      amazon: amazon.mode,
      ebay: ebay.mode,
      generic: generic.mode,
    },
    notes: paired.map((p) => p.result.note),
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
