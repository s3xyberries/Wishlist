export type RegionId = "au" | "us";

export interface RegionConfig {
  id: RegionId;
  label: string;
  /** Short flag-free label for the switcher */
  shortLabel: string;
  currency: string;
  locale: string;
  /** Google Shopping / SerpAPI country */
  googleGl: string;
  googleHl: string;
  amazonHost: string;
  amazonMerchantLabel: string;
  ebayHost: string;
  ebayMarketplaceId: string;
  /** Official brand PDP hosts / paths keyed by product id */
  officialProducts: Array<{
    id: string;
    brand: string;
    match: RegExp;
    url: string;
  }>;
}

export const DEFAULT_REGION_ID: RegionId = "au";

export const REGIONS: Record<RegionId, RegionConfig> = {
  au: {
    id: "au",
    label: "Australia",
    shortLabel: "AU",
    currency: "AUD",
    locale: "en-AU",
    googleGl: "au",
    googleHl: "en",
    amazonHost: "www.amazon.com.au",
    amazonMerchantLabel: "Amazon.com.au",
    ebayHost: "www.ebay.com.au",
    ebayMarketplaceId: "EBAY_AU",
    officialProducts: [
      {
        id: "bambu-h2s",
        brand: "Bambu Lab",
        match: /bambu.*\bh2s\b|\bh2s\b.*bambu|\bh2s\b.*3d\s*printer/i,
        url: "https://au.store.bambulab.com/products/h2s",
      },
      {
        id: "bambu-h2d",
        brand: "Bambu Lab",
        match: /bambu.*\bh2d\b|\bh2d\b.*bambu/i,
        url: "https://au.store.bambulab.com/products/h2d",
      },
      {
        id: "bambu-x1c",
        brand: "Bambu Lab",
        match: /bambu.*\bx1[\s-]?c(arbon)?\b|\bx1[\s-]?carbon\b/i,
        url: "https://au.store.bambulab.com/products/x1-carbon",
      },
    ],
  },
  us: {
    id: "us",
    label: "United States",
    shortLabel: "US",
    currency: "USD",
    locale: "en-US",
    googleGl: "us",
    googleHl: "en",
    amazonHost: "www.amazon.com",
    amazonMerchantLabel: "Amazon.com",
    ebayHost: "www.ebay.com",
    ebayMarketplaceId: "EBAY_US",
    officialProducts: [
      {
        id: "bambu-h2s",
        brand: "Bambu Lab",
        match: /bambu.*\bh2s\b|\bh2s\b.*bambu|\bh2s\b.*3d\s*printer/i,
        url: "https://us.store.bambulab.com/products/h2s",
      },
      {
        id: "bambu-h2d",
        brand: "Bambu Lab",
        match: /bambu.*\bh2d\b|\bh2d\b.*bambu/i,
        url: "https://us.store.bambulab.com/products/h2d",
      },
      {
        id: "bambu-x1c",
        brand: "Bambu Lab",
        match: /bambu.*\bx1[\s-]?c(arbon)?\b|\bx1[\s-]?carbon\b/i,
        url: "https://us.store.bambulab.com/products/x1-carbon",
      },
    ],
  },
};

export const REGION_LIST: RegionConfig[] = Object.values(REGIONS);

export function isRegionId(value: unknown): value is RegionId {
  return value === "au" || value === "us";
}

export function getRegion(id?: string | null): RegionConfig {
  if (isRegionId(id)) return REGIONS[id];
  return REGIONS[DEFAULT_REGION_ID];
}

export const REGION_COOKIE = "pricekeep-region";
export const REGION_STORAGE_KEY = "pricekeep-region";
