"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, Search, ShoppingBag } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/format";
import { useRegion } from "@/lib/region/context";
import { fetchSearchApi } from "@/lib/search-api";
import { useWishlistStore } from "@/lib/store";
import type { SearchResult } from "@/lib/types";

type Status = "idle" | "loading" | "empty" | "error" | "ready";

type CatalogSearchResult = SearchResult & {
  fromCatalog?: boolean;
  lastScrapedAt?: string;
};

export function SearchExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQ = searchParams.get("q")?.trim() ?? "";
  const { region, regionId } = useRegion();
  const { trackProduct } = useWishlistStore();
  const [query, setQuery] = useState(initialQ);
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<CatalogSearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [searchMode, setSearchMode] = useState<string>("idle");
  const [searchOrigin, setSearchOrigin] = useState<"catalog" | "scrape" | null>(
    null,
  );
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastRequestUrl, setLastRequestUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function runSearch(value: string, forceRefresh = false) {
    const q = value.trim();
    setSubmitted(q);
    setErrorMessage(null);
    setLastRequestUrl(null);
    if (!q) {
      setResults([]);
      setStatus("idle");
      setSearchMode("idle");
      setSearchOrigin(null);
      setSearchNote(null);
      setStale(false);
      return;
    }
    setStatus("loading");

    // Shareable ?q= without a document GET or App Router remount (avoids double-fetch).
    const shareUrl = `/?q=${encodeURIComponent(q)}`;
    if (`${window.location.pathname}${window.location.search}` !== shareUrl) {
      window.history.replaceState(null, "", shareUrl);
    }

    const result = await fetchSearchApi({
      origin: window.location.origin,
      q,
      regionId,
      forceRefresh,
    });
    setLastRequestUrl(result.requestUrl);

    if (!result.ok) {
      console.error("[Pricekeep search]", result.reason, result.requestUrl, {
        status: result.status,
        contentType: result.contentType,
        preview: result.rawPreview,
      });
      setResults([]);
      setSearchMode("error");
      setSearchOrigin(null);
      setSearchNote(null);
      setStale(false);
      setStatus("error");
      setErrorMessage(result.message);
      return;
    }

    const data = result.data;
    const hits = (data.results ?? []) as CatalogSearchResult[];
    setResults(hits);
    setSearchMode(data.mode ?? "scrape");
    setSearchOrigin(
      data.origin ?? (data.mode === "catalog" ? "catalog" : "scrape"),
    );
    setSearchNote(
      [data.note, data.catalogWarning].filter(Boolean).join(" ") || null,
    );
    setStale(Boolean(data.stale));
    if (data.mode === "error" && !hits.length) {
      setStatus("error");
      setErrorMessage(
        data.error || data.note || "Live search failed. Try again.",
      );
      return;
    }
    setStatus(hits.length ? "ready" : "empty");
  }

  useEffect(() => {
    if (!initialQ) return;
    const id = window.setTimeout(() => {
      void runSearch(initialQ);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ, regionId]);

  // Re-run current query when region changes
  useEffect(() => {
    if (!submitted) return;
    const id = window.setTimeout(() => {
      void runSearch(submitted);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionId]);

  function onSearchClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    void runSearch(query);
  }

  function openConfirm(item: CatalogSearchResult) {
    setSelected(item);
    setConfirmOpen(true);
  }

  function confirmTrack() {
    if (!selected) return;
    startTransition(() => {
      const id = trackProduct(selected, submitted || selected.title);
      setConfirmOpen(false);
      router.push(`/product/${id}`);
    });
  }

  const fromCatalog = searchOrigin === "catalog";

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-teal-900/10 bg-gradient-to-br from-teal-50/90 via-background to-slate-100/80 px-5 py-8 sm:px-8 sm:py-12">
        <div className="max-w-xl space-y-4">
          <p className="font-heading text-4xl leading-[1.05] tracking-tight text-teal-950 sm:text-5xl">
            Pricekeep
          </p>
          <h1 className="text-lg font-medium text-slate-800 sm:text-xl">
            Find a product. Confirm it. Track the price.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
            Live scrape for {region.shortLabel} ({region.currency}). Successful
            scrapes land in a region-scoped shared catalog so the next search can
            reuse them. Fresh scrapes only run when the catalog is empty or stale
            — or when you force a refresh.
          </p>
          {/*
            Not a <form method="get"> — native GET would navigate to /?q=… (HTML
            document). Search must only use fetch → /api/search (JSON).
          */}
          <div
            role="search"
            className="flex flex-col gap-2 sm:flex-row"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch(query);
              }
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Try “bambu lab h2s”, “sony headphones”, “kindle”"
                className="h-11 pl-9"
                aria-label="Search products"
                autoComplete="off"
                enterKeyHint="search"
              />
            </div>
            <Button
              type="button"
              size="lg"
              className="h-11 bg-teal-800 hover:bg-teal-700"
              onClick={onSearchClick}
            >
              Search
            </Button>
          </div>
          {searchNote && status !== "idle" ? (
            <div className="flex flex-wrap items-center gap-2">
              {fromCatalog ? (
                <Badge className="bg-teal-800 text-white hover:bg-teal-800">
                  {stale ? "Stale catalog" : "From catalog"}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-teal-800/40 text-teal-900">
                  Fresh scrape
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">{searchNote}</p>
              {status === "ready" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void runSearch(submitted || query, true)}
                >
                  <RefreshCw className="size-3.5" />
                  Force refresh
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        <ShoppingBag
          className="pointer-events-none absolute -right-6 -bottom-4 size-36 text-teal-800/10 sm:right-8 sm:bottom-6 sm:size-44"
          aria-hidden
        />
      </section>

      <section className="space-y-4" aria-live="polite">
        {status === "idle" ? (
          <p className="text-sm text-muted-foreground">
            Catalog first, scrape second.{" "}
            <Link href="/catalog" className="underline underline-offset-2">
              Browse the shared catalog
            </Link>
            .
          </p>
        ) : null}

        {status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking shared catalog, then scraping if needed…
          </div>
        ) : null}

        {status === "error" && errorMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Search failed</AlertTitle>
            <AlertDescription>
              <span className="block">{errorMessage}</span>
              {lastRequestUrl ? (
                <span className="mt-2 block break-all font-mono text-[11px] opacity-90">
                  Request: {lastRequestUrl}
                </span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "empty" ? (
          <Alert>
            <AlertTitle>No matches for “{submitted}”</AlertTitle>
            <AlertDescription>
              Nothing in the shared catalog and the live scrape returned empty.
              Try a clearer brand or model name.
            </AlertDescription>
          </Alert>
        ) : null}

        {status === "ready" ? (
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => openConfirm(item)}
                  className="flex w-full gap-4 py-4 text-left transition-colors hover:bg-teal-50/50 focus-visible:bg-teal-50/70 focus-visible:outline-none"
                >
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted sm:size-24">
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="96px"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.brand ? (
                        <Badge variant="secondary">{item.brand}</Badge>
                      ) : null}
                      {item.fromCatalog || fromCatalog ? (
                        <Badge
                          variant="outline"
                          className="border-teal-700/30 text-teal-900"
                        >
                          Catalog
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-amber-700/30 text-amber-950"
                        >
                          Just scraped
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {item.merchantHint}
                      </span>
                    </div>
                    <p className="font-medium leading-snug text-foreground">
                      {item.title}
                    </p>
                    <p className="text-sm text-teal-900">
                      from {formatMoney(item.priceSnippet, item.currency)}
                      {item.rating ? (
                        <span className="ml-2 text-muted-foreground">
                          ★ {item.rating}
                          {item.reviewCount
                            ? ` · ${item.reviewCount.toLocaleString()} reviews`
                            : ""}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {status === "ready" && searchMode ? (
          <p className="text-xs text-muted-foreground">
            Mode: <code className="rounded bg-muted px-1 py-0.5">{searchMode}</code>
            {searchOrigin ? (
              <>
                {" "}
                · origin:{" "}
                <code className="rounded bg-muted px-1 py-0.5">{searchOrigin}</code>
              </>
            ) : null}
          </p>
        ) : null}
      </section>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => setConfirmOpen(open)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm this product?</DialogTitle>
            <DialogDescription>
              Intercept step: make sure this is the exact item you want before we
              discover seller pages and start a price history.
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="flex gap-3">
              <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                <Image
                  src={selected.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium leading-snug">{selected.title}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.brand ? `${selected.brand} · ` : ""}
                  listed from {formatMoney(selected.priceSnippet, selected.currency)}
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Keep searching
            </Button>
            <Button
              className="bg-teal-800 hover:bg-teal-700"
              onClick={confirmTrack}
              disabled={pending}
            >
              {pending ? "Adding…" : "Looks right — track this"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
