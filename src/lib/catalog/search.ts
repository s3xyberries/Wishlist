import {
  searchProducts,
  type SearchMode,
  type SearchResponse,
} from "@/lib/scrape/google-shopping";
import type { RegionConfig } from "@/lib/region/config";
import { CatalogUnavailableError } from "./db";
import {
  lookupQueryCache,
  matchCatalogProducts,
  normalizeQuery,
  recordSearchResults,
} from "./store";
import type { CatalogOrigin, CatalogSearchHit } from "./types";
import { CATALOG_TTL_MS } from "./types";

export type SearchWithCatalogMode = SearchMode | "catalog";

export interface SearchWithCatalogResponse
  extends Omit<SearchResponse, "mode" | "results"> {
  results: CatalogSearchHit[];
  mode: SearchWithCatalogMode;
  origin: "catalog" | "scrape";
  stale?: boolean;
  catalogTtlMs: number;
  region: string;
  currency: string;
  catalogWarning?: string;
}

function asCatalogHits(
  results: SearchResponse["results"],
  fromCatalog: boolean,
): CatalogSearchHit[] {
  return results.map((r) => ({ ...r, fromCatalog }));
}

function isLiveScrapeMode(
  mode: SearchMode,
): mode is Exclude<CatalogOrigin, "catalog"> {
  return (
    mode === "serpapi" ||
    mode === "scrape" ||
    mode === "amazon-scrape" ||
    mode === "official-scrape"
  );
}

function catalogErrorMessage(err: unknown): string | null {
  if (err instanceof CatalogUnavailableError) return err.message;
  if (err instanceof Error && /sqlite|better-sqlite3/i.test(err.message)) {
    return err.message;
  }
  return null;
}

/**
 * Shared-catalog-aware search (region-scoped).
 * If the SQLite catalog is unavailable, falls through to live scrape so search still works.
 */
export async function searchWithCatalog(
  query: string,
  region: RegionConfig,
  options?: { forceRefresh?: boolean },
): Promise<SearchWithCatalogResponse> {
  const q = query.trim();
  const forceRefresh = Boolean(options?.forceRefresh);
  const catalogTtlMs = CATALOG_TTL_MS;
  const regionId = region.id;
  let catalogWarning: string | undefined;

  if (!normalizeQuery(q)) {
    return {
      results: [],
      mode: "empty",
      note: "Empty query.",
      origin: "catalog",
      catalogTtlMs,
      region: regionId,
      currency: region.currency,
    };
  }

  if (!forceRefresh) {
    try {
      const cached = await lookupQueryCache(q, regionId, catalogTtlMs);
      if (cached?.fresh && cached.hits.length) {
        return {
          results: cached.hits,
          mode: "catalog",
          note: `From ${region.shortLabel} shared catalog (saved ${cached.entry?.scrapedAt ? new Date(cached.entry.scrapedAt).toLocaleString(region.locale) : "earlier"}). No scrape this time.`,
          origin: "catalog",
          catalogTtlMs,
          region: regionId,
          currency: region.currency,
        };
      }

      const soft = await matchCatalogProducts(q, regionId);
      const softFresh = soft.filter(
        (h) =>
          h.lastScrapedAt &&
          Date.now() - Date.parse(h.lastScrapedAt) < catalogTtlMs,
      );
      if (softFresh.length) {
        return {
          results: softFresh,
          mode: "catalog",
          note: `From ${region.shortLabel} shared catalog (matched existing scraped products). No scrape this time.`,
          origin: "catalog",
          catalogTtlMs,
          region: regionId,
          currency: region.currency,
        };
      }

      if (cached?.hits.length && cached.entry) {
        const live = await searchProducts(q, region);
        if (live.results.length && isLiveScrapeMode(live.mode)) {
          try {
            const recorded = await recordSearchResults(
              q,
              regionId,
              live.results,
              live.mode,
            );
            return {
              results: recorded.map((h) => ({ ...h, fromCatalog: false })),
              mode: live.mode,
              note: `${live.note} Saved to ${region.shortLabel} catalog.`,
              origin: "scrape",
              catalogTtlMs,
              region: regionId,
              currency: region.currency,
            };
          } catch (err) {
            catalogWarning = catalogErrorMessage(err) ?? undefined;
            return {
              results: asCatalogHits(live.results, false),
              mode: live.mode,
              note: `${live.note} (catalog save skipped).`,
              origin: "scrape",
              catalogTtlMs,
              region: regionId,
              currency: region.currency,
              catalogWarning,
            };
          }
        }
        return {
          results: cached.hits,
          mode: "catalog",
          note: `Live scrape failed — serving stale ${region.shortLabel} catalog entry.`,
          origin: "catalog",
          stale: true,
          catalogTtlMs,
          region: regionId,
          currency: region.currency,
        };
      }
    } catch (err) {
      catalogWarning = catalogErrorMessage(err) ?? undefined;
      // Fall through to live scrape
    }
  }

  const live = await searchProducts(q, region);
  if (live.results.length && isLiveScrapeMode(live.mode)) {
    try {
      const recorded = await recordSearchResults(
        q,
        regionId,
        live.results,
        live.mode,
      );
      return {
        results: recorded.map((h) => ({ ...h, fromCatalog: false })),
        mode: live.mode,
        note: forceRefresh
          ? `${live.note} Forced refresh — ${region.shortLabel} catalog updated.`
          : `${live.note} Saved to ${region.shortLabel} catalog.`,
        origin: "scrape",
        catalogTtlMs,
        region: regionId,
        currency: region.currency,
        catalogWarning,
      };
    } catch (err) {
      catalogWarning =
        catalogWarning ?? catalogErrorMessage(err) ?? undefined;
      return {
        results: asCatalogHits(live.results, false),
        mode: live.mode,
        note: `${live.note} (catalog save skipped).`,
        origin: "scrape",
        catalogTtlMs,
        region: regionId,
        currency: region.currency,
        catalogWarning,
      };
    }
  }

  if (forceRefresh) {
    try {
      const soft = await matchCatalogProducts(q, regionId);
      if (soft.length) {
        return {
          results: soft,
          mode: "catalog",
          note: `Forced refresh found no live results — showing ${region.shortLabel} catalog matches.`,
          origin: "catalog",
          stale: true,
          catalogTtlMs,
          region: regionId,
          currency: region.currency,
          catalogWarning,
        };
      }
    } catch (err) {
      catalogWarning =
        catalogWarning ?? catalogErrorMessage(err) ?? undefined;
    }
  }

  return {
    results: asCatalogHits(live.results, false),
    mode: live.mode,
    note: live.note,
    origin: "scrape",
    catalogTtlMs,
    region: regionId,
    currency: region.currency,
    catalogWarning,
  };
}
