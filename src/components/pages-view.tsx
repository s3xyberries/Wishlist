"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, formatRelative } from "@/lib/format";
import type { WatchedPage } from "@/lib/pages/store";
import { useRegion } from "@/lib/region/context";

export function PagesView() {
  const { region, regionId } = useRegion();
  const [pages, setPages] = useState<WatchedPage[]>([]);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages?region=${regionId}`, {
        headers: { "x-pricekeep-region": regionId },
      });
      const data = (await res.json()) as { pages?: WatchedPage[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not load pages");
      setPages(data.pages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load pages");
      setPages([]);
    } finally {
      setLoading(false);
    }
  }, [regionId]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste a product page URL first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages?region=${regionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pricekeep-region": regionId,
        },
        body: JSON.stringify({ url: trimmed, label: label.trim() || undefined }),
      });
      const data = (await res.json()) as { page?: WatchedPage; error?: string };
      if (!res.ok || !data.page) {
        throw new Error(data.error || "Could not scrape that page");
      }
      setUrl("");
      setLabel("");
      setPages((current) => [
        data.page!,
        ...current.filter((page) => page.id !== data.page!.id),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not scrape that page");
    } finally {
      setSaving(false);
    }
  }

  async function refresh(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/pages?region=${regionId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pricekeep-region": regionId,
        },
        body: JSON.stringify({ action: "refresh", id }),
      });
      const data = (await res.json()) as { page?: WatchedPage; error?: string };
      if (!res.ok || !data.page) {
        throw new Error(data.error || "Price scrape failed");
      }
      setPages((current) =>
        current.map((page) => (page.id === id ? data.page! : page)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Price scrape failed");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(
        `/api/pages?region=${regionId}&id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: { "x-pricekeep-region": regionId },
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not remove that page");
      setPages((current) => current.filter((page) => page.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that page");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-3xl tracking-tight text-teal-950">
          Pages · {region.shortLabel}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add a product page from any shop. Pricekeep scrapes the price on that
          site, keeps it for {region.currency} search, and rechecks it with the
          daily price job.
        </p>
      </div>

      <form
        onSubmit={onAdd}
        className="space-y-3 rounded-xl border border-teal-900/10 bg-teal-50/40 p-4 sm:p-5"
      >
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]">
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://shop.example/products/item"
            aria-label="Product page URL"
            className="h-10"
            autoComplete="off"
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Search words (optional)"
            aria-label="Search words"
            className="h-10"
            autoComplete="off"
          />
          <Button type="submit" className="h-10 bg-teal-800 hover:bg-teal-700" disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            {saving ? "Scraping…" : "Add page"}
          </Button>
        </div>
      </form>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Page scrape failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading saved pages…
        </div>
      ) : null}

      {!loading && pages.length === 0 ? (
        <Alert>
          <AlertTitle>No extra pages yet</AlertTitle>
          <AlertDescription>
            Paste a product URL above. The price is scraped from that site, and
            later searches can match the title or the search words you set.
          </AlertDescription>
        </Alert>
      ) : null}

      {!loading && pages.length > 0 ? (
        <ul className="space-y-3">
          {pages.map((page) => (
            <li
              key={page.id}
              className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-3 sm:flex-row sm:items-center sm:p-4"
            >
              {/* Merchant hosts are arbitrary, so this cannot go through next/image remotePatterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.imageUrl}
                alt=""
                className="size-16 shrink-0 rounded-md bg-muted object-cover sm:size-20"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium leading-snug">{page.title}</p>
                <p className="text-sm text-teal-900">
                  {formatMoney(page.price, page.currency)}
                  <span className="ml-2 text-muted-foreground">{page.merchant}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">{page.url}</p>
                <p className="text-xs text-muted-foreground">
                  Search words: {page.label}
                  {" · "}
                  checked {formatRelative(page.lastScrapedAt)}
                  {page.lastError ? ` · ${page.lastError}` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyId === page.id}
                  onClick={() => void refresh(page.id)}
                >
                  <RefreshCw className="size-3.5" />
                  Check price
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busyId === page.id}
                  onClick={() => void remove(page.id)}
                >
                  <Trash2 className="size-3.5" />
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
