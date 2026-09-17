"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, formatRelative } from "@/lib/format";
import { useRegion } from "@/lib/region/context";
import { useWishlistStore } from "@/lib/store";
import type { SearchResult } from "@/lib/types";

type CatalogProduct = SearchResult & {
  fromCatalog?: boolean;
  lastScrapedAt?: string;
};

type CatalogQuery = {
  queryKey: string;
  queryText: string;
  productIds: string[];
  scrapedAt: string;
  sourceMode: string;
};

export function CatalogView() {
  const router = useRouter();
  const { region, regionId } = useRegion();
  const { trackProduct } = useWishlistStore();
  const [filter, setFilter] = useState("");
  const [applied, setApplied] = useState("");
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [queries, setQueries] = useState<CatalogQuery[]>([]);
  const [total, setTotal] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [ttlMs, setTtlMs] = useState(6 * 60 * 60 * 1000);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ region: regionId });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/catalog?${params.toString()}`, {
          headers: { "x-pricekeep-region": regionId },
        });
        if (!res.ok) throw new Error("catalog request failed");
        const data = (await res.json()) as {
          products: CatalogProduct[];
          queries: CatalogQuery[];
          totalProducts: number;
          note?: string;
          ttlMs?: number;
        };
        setProducts(data.products);
        setQueries(data.queries);
        setTotal(data.totalProducts);
        setNote(data.note ?? null);
        if (data.ttlMs) setTtlMs(data.ttlMs);
      } catch {
        setError("Could not load the shared catalog.");
        setProducts([]);
        setQueries([]);
      } finally {
        setLoading(false);
      }
    },
    [regionId],
  );

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load(filter);
    }, 0);
    return () => window.clearTimeout(id);
  }, [load, regionId]);

  function onFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApplied(filter.trim());
    void load(filter);
  }

  function track(item: CatalogProduct) {
    const id = trackProduct(item, applied || item.title);
    router.push(`/product/${id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-tight text-teal-950">
          Shared catalog · {region.shortLabel}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Products saved from successful {region.currency} scrapes. Fresh for
          about {Math.round(ttlMs / 3_600_000)} hours — search reuses these
          before scraping again.{" "}
          <Link href="/" className="underline underline-offset-2">
            Back to search
          </Link>
        </p>
      </div>

      <form onSubmit={onFilterSubmit} className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter catalog (e.g. bambu, h2s)"
            className="h-10 pl-9"
            aria-label="Filter shared catalog"
          />
        </div>
        <Button type="submit" variant="outline" className="h-10">
          Filter
        </Button>
      </form>

      {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading shared catalog…
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Catalog unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!loading && !error && products.length === 0 ? (
        <Alert>
          <AlertTitle>No catalog entries yet</AlertTitle>
          <AlertDescription>
            <Link href="/" className="underline underline-offset-2">
              Search and scrape a product
            </Link>{" "}
            — it will appear here for everyone on this server.
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && products.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing {products.length}
            {total > products.length ? ` of ${total}` : ""} shared product
            {products.length === 1 ? "" : "s"}
            {applied ? ` matching “${applied}”` : ""}.
          </p>
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {products.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted sm:size-20">
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-teal-800 text-white hover:bg-teal-800">
                        From catalog
                      </Badge>
                      {item.brand ? (
                        <Badge variant="secondary">{item.brand}</Badge>
                      ) : null}
                    </div>
                    <p className="font-medium leading-snug">{item.title}</p>
                    <p className="text-sm text-teal-900">
                      {formatMoney(item.priceSnippet, item.currency)}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {item.merchantHint}
                        {item.lastScrapedAt
                          ? ` · scraped ${formatRelative(item.lastScrapedAt)}`
                          : ""}
                      </span>
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="bg-teal-800 hover:bg-teal-700 sm:shrink-0"
                  onClick={() => track(item)}
                >
                  Track this
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!loading && queries.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-teal-950">Recent searches</h2>
          <ul className="flex flex-wrap gap-2">
            {queries.slice(0, 12).map((q) => (
              <li key={q.queryKey}>
                <Link
                  href={`/?q=${encodeURIComponent(q.queryText)}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border/80 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-teal-800/30 hover:text-foreground"
                >
                  {q.queryText}
                  <span className="text-[10px] opacity-70">
                    {formatRelative(q.scrapedAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
