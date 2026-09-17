import { candidatesToOffers, type OfferCandidate } from "@/lib/adapters";
import type { RegionConfig } from "@/lib/region/config";
import { getRegion } from "@/lib/region/config";
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
  region: string;
}

/**
 * Fan-out live offer discovery only — no stub/mock candidates.
 * Targets Amazon/eBay/official hosts for the active region.
 */
export async function discoverLiveOffers(
  product: SearchResult,
  productId?: string,
  region: RegionConfig = getRegion("au"),
): Promise<LiveDiscoverResponse> {
  const [amazon, ebay, generic] = await Promise.all([
    discoverAmazonOffer(product, region),
    discoverEbayOffer(product, region),
    discoverGenericOffer(product, region),
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
    region: region.id,
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
