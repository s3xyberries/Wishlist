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
  const [selected, setSelected] = useState<CatalogSearchResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function runSearch(value: string, forceRefresh = false) {
    const q = value.trim();
    setSubmitted(q);
    setErrorMessage(null);
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
    try {
      const params = new URLSearchParams({ q });
      if (forceRefresh) params.set("refresh", "1");
      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error("Search request failed");
      const data = (await res.json()) as {
        results: CatalogSearchResult[];
        mode: string;
        note?: string;
        origin?: "catalog" | "scrape";
        stale?: boolean;
      };
      setResults(data.results);
      setSearchMode(data.mode ?? "scrape");
      setSearchOrigin(data.origin ?? (data.mode === "catalog" ? "catalog" : "scrape"));
      setSearchNote(data.note ?? null);
      setStale(Boolean(data.stale));
      if (data.mode === "error" && data.results.length === 0) {
        setStatus("error");
        setErrorMessage(data.note ?? "Live search failed. Try again.");
        return;
      }
      setStatus(data.results.length ? "ready" : "empty");
    } catch {
      setResults([]);
      setSearchMode("error");
      setSearchOrigin(null);
      setSearchNote(null);
      setStale(false);
      setStatus("error");
      setErrorMessage("Could not reach the scrape API. Try again in a moment.");
    }
  }

  useEffect(() => {
    if (!initialQ) return;
    const id = window.setTimeout(() => {
      void runSearch(initialQ);
    }, 0);
    return () => window.clearTimeout(id);
  }, [initialQ]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    void runSearch(query);
  }

  function onSearchClick(e: React.MouseEvent) {
    e.preventDefault();
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
            Successful scrapes land in a shared catalog so the next search can
            reuse them. Fresh scrapes only run when the catalog is empty or
            stale — or when you force a refresh.
          </p>
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-2 sm:flex-row"
            action="#"
            method="get"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSearch(query);
                  }
                }}
                placeholder="Try “bambu lab h2s”, “sony headphones”, “kindle”"
                className="h-11 pl-9"
                aria-label="Search products"
                name="q"
                autoComplete="off"
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
          </form>
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
            <AlertDescription>{errorMessage}</AlertDescription>
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
