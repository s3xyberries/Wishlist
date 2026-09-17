"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2, Search, ShoppingBag } from "lucide-react";
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

export function SearchExperience() {
  const router = useRouter();
  const { trackProduct } = useWishlistStore();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [searchMode, setSearchMode] = useState<string>("idle");
  const [searchNote, setSearchNote] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  async function runSearch(value: string) {
    const q = value.trim();
    setSubmitted(q);
    setErrorMessage(null);
    if (!q) {
      setResults([]);
      setStatus("idle");
      setSearchMode("idle");
      setSearchNote(null);
      return;
    }
    setStatus("loading");
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error("Search request failed");
      const data = (await res.json()) as {
        results: SearchResult[];
        mode: string;
        note?: string;
      };
      setResults(data.results);
      setSearchMode(data.mode ?? "scrape");
      setSearchNote(data.note ?? null);
      if (data.mode === "error" && data.results.length === 0) {
        setStatus("error");
        setErrorMessage(data.note ?? "Live search failed. Try again.");
        return;
      }
      setStatus(data.results.length ? "ready" : "empty");
    } catch {
      setResults([]);
      setSearchMode("error");
      setSearchNote(null);
      setStatus("error");
      setErrorMessage("Could not reach the scrape API. Try again in a moment.");
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    void runSearch(query);
  }

  function onSearchClick(e: React.MouseEvent) {
    e.preventDefault();
    void runSearch(query);
  }

  function openConfirm(item: SearchResult) {
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
            Live scrape search only — confirm the right item, then discover
            Amazon, eBay, and official store prices when the scrape succeeds.
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
            <p className="text-xs text-muted-foreground">
              {searchNote}
              {searchMode === "scrape" || searchMode === "amazon-scrape" ? (
                <>
                  {" "}
                  Optional:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    SERPAPI_API_KEY
                  </code>{" "}
                  for Google Shopping API results.
                </>
              ) : null}
            </p>
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
            Results come from live shopping scrapes or SerpAPI — nothing is
            seeded.
          </p>
        ) : null}

        {status === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Scraping shopping results…
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
            <AlertTitle>No live matches for “{submitted}”</AlertTitle>
            <AlertDescription>
              The scrape returned nothing. Try a clearer brand or model name, or
              retry in a moment.
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
              scrape seller pages and start a price history.
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
