import { searchProducts, type SearchMode, type SearchResponse } from "@/lib/scrape/google-shopping";
import {
  lookupQueryCache,
  matchCatalogProducts,
  normalizeQuery,
  recordSearchResults,
} from "./store";
import type { CatalogOrigin, CatalogSearchHit } from "./types";
import { CATALOG_TTL_MS } from "./types";

export type SearchWithCatalogMode = SearchMode | "catalog";

export interface SearchWithCatalogResponse extends Omit<SearchResponse, "mode" | "results"> {
  results: CatalogSearchHit[];
  mode: SearchWithCatalogMode;
  origin: "catalog" | "scrape";
  stale?: boolean;
  catalogTtlMs: number;
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

/**
 * Shared-catalog-aware search:
 * 1. Exact query cache (fresh) → catalog hit, no scrape
 * 2. Soft product match (fresh enough) → catalog hit, no scrape
 * 3. Else live scrape; on success, upsert into shared catalog
 */
export async function searchWithCatalog(
  query: string,
  options?: { forceRefresh?: boolean },
): Promise<SearchWithCatalogResponse> {
  const q = query.trim();
  const forceRefresh = Boolean(options?.forceRefresh);
  const catalogTtlMs = CATALOG_TTL_MS;

  if (!normalizeQuery(q)) {
    return {
      results: [],
      mode: "empty",
      note: "Empty query.",
      origin: "catalog",
      catalogTtlMs,
    };
  }

  if (!forceRefresh) {
    const cached = await lookupQueryCache(q, catalogTtlMs);
    if (cached?.fresh && cached.hits.length) {
      return {
        results: cached.hits,
        mode: "catalog",
        note: `From shared catalog (saved ${cached.entry?.scrapedAt ? new Date(cached.entry.scrapedAt).toLocaleString() : "earlier"}). No scrape this time.`,
        origin: "catalog",
        catalogTtlMs,
      };
    }

    // Soft match when exact query key differs slightly (e.g. "bambu h2s" vs "bambu lab h2s")
    const soft = await matchCatalogProducts(q);
    const softFresh = soft.filter(
      (h) => h.lastScrapedAt && Date.now() - Date.parse(h.lastScrapedAt) < catalogTtlMs,
    );
    if (softFresh.length) {
      return {
        results: softFresh,
        mode: "catalog",
        note: "From shared catalog (matched existing scraped products). No scrape this time.",
        origin: "catalog",
        catalogTtlMs,
      };
    }

    // Stale exact cache: return it only if scrape later fails (handled below as fallback)
    if (cached?.hits.length && cached.entry) {
      // Fall through to scrape; keep stale hits for failure fallback
      const live = await searchProducts(q);
      if (live.results.length && isLiveScrapeMode(live.mode)) {
        const recorded = await recordSearchResults(q, live.results, live.mode);
        return {
          results: recorded.map((h) => ({ ...h, fromCatalog: false })),
          mode: live.mode,
          note: `${live.note} Saved to shared catalog.`,
          origin: "scrape",
          catalogTtlMs,
        };
      }
      return {
        results: cached.hits,
        mode: "catalog",
        note: "Live scrape failed — serving stale shared catalog entry.",
        origin: "catalog",
        stale: true,
        catalogTtlMs,
      };
    }
  }

  const live = await searchProducts(q);
  if (live.results.length && isLiveScrapeMode(live.mode)) {
    const recorded = await recordSearchResults(q, live.results, live.mode);
    return {
      results: recorded.map((h) => ({ ...h, fromCatalog: false })),
      mode: live.mode,
      note: forceRefresh
        ? `${live.note} Forced refresh — catalog updated.`
        : `${live.note} Saved to shared catalog.`,
      origin: "scrape",
      catalogTtlMs,
    };
  }

  // Force refresh with no live results: try any catalog match as last resort
  if (forceRefresh) {
    const soft = await matchCatalogProducts(q);
    if (soft.length) {
      return {
        results: soft,
        mode: "catalog",
        note: "Forced refresh found no live results — showing shared catalog matches.",
        origin: "catalog",
        stale: true,
        catalogTtlMs,
      };
    }
  }

  return {
    results: asCatalogHits(live.results, false),
    mode: live.mode,
    note: live.note,
    origin: "scrape",
    catalogTtlMs,
  };
}
