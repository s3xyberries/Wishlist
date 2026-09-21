import type { SearchResult, SourceId } from "@/lib/types";

export type CatalogOrigin =
  | "serpapi"
  | "scrape"
  | "browser-scrape"
  | "amazon-scrape"
  | "official-scrape"
  | "catalog";

export interface CatalogProduct {
  id: string;
  fingerprint: string;
  title: string;
  brand?: string;
  imageUrl: string;
  priceSnippet: number;
  currency: string;
  merchantHint: string;
  sourceHint: SourceId | "shopping";
  rating?: number;
  reviewCount?: number;
  /** When this product row was last written from a live scrape. */
  lastScrapedAt: string;
  /** How the last live scrape obtained this row. */
  scrapeMode: Exclude<CatalogOrigin, "catalog">;
  /** Normalized queries that have returned this product. */
  queryKeys: string[];
  hitCount: number;
}

export interface CatalogQueryEntry {
  queryKey: string;
  /** Display form of the first query that populated this entry. */
  queryText: string;
  productIds: string[];
  scrapedAt: string;
  sourceMode: Exclude<CatalogOrigin, "catalog">;
}

export interface CatalogSearchHit extends SearchResult {
  fromCatalog: boolean;
  lastScrapedAt?: string;
}

/** Default TTL before a cached query is considered stale (6 hours). */
export const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;
