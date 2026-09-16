"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BellOff,
  BellRing,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { SOURCE_LABELS } from "@/lib/adapters";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney, formatRelative } from "@/lib/format";
import { useWishlistStore } from "@/lib/store";
import type { Offer, PricePoint } from "@/lib/types";
import { cn } from "@/lib/utils";

function PriceHistoryChart({ points }: { points: PricePoint[] }) {
  const { min, max, path, area } = useMemo(() => {
    if (points.length === 0) {
      return { min: 0, max: 0, path: "", area: "" };
    }
    const prices = points.map((p) => p.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.12 || hi * 0.05 || 1;
    const yMin = lo - pad;
    const yMax = hi + pad;
    const w = 320;
    const h = 120;
    const coords = points.map((p, i) => {
      const x = (i / Math.max(points.length - 1, 1)) * w;
      const y = h - ((p.price - yMin) / (yMax - yMin)) * h;
      return [x, y] as const;
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ");
    const areaPath = `${line} L${w},${h} L0,${h} Z`;
    return { min: lo, max: hi, path: line, area: areaPath };
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No price history yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox="0 0 320 120"
        className="h-36 w-full overflow-visible"
        role="img"
        aria-label="Price history chart"
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(15 118 110)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="rgb(15 118 110)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#priceFill)" className="animate-in fade-in duration-700" />
        <path
          d={path}
          fill="none"
          stroke="rgb(15 118 110)"
          strokeWidth="2.5"
          strokeLinejoin="round"
          className="animate-in fade-in duration-700"
        />
      </svg>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Low {formatMoney(min)}</span>
        <span>
          {points.length} points · last{" "}
          {formatRelative(points[points.length - 1].capturedAt)}
        </span>
        <span>High {formatMoney(max)}</span>
      </div>
    </div>
  );
}

function OfferRow({
  offer,
  selected,
  onSelect,
  onDismiss,
  onRestore,
}: {
  offer: Offer;
  selected: boolean;
  onSelect: () => void;
  onDismiss: () => void;
  onRestore: () => void;
}) {
  const dismissed = offer.status === "dismissed";
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        selected ? "border-teal-700/40 bg-teal-50/60" : "border-border/80 bg-background/60",
        dismissed && "opacity-60",
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{SOURCE_LABELS[offer.sourceId]}</Badge>
          {offer.status === "suspected_mismatch" ? (
            <Badge variant="outline" className="border-amber-600/40 text-amber-900">
              Possible mismatch
            </Badge>
          ) : null}
          {dismissed ? <Badge variant="outline">Dismissed</Badge> : null}
        </div>
        <p className="mt-1 text-sm font-medium leading-snug">{offer.title}</p>
        <p className="mt-1 text-sm text-teal-900">
          {formatMoney(offer.lastPrice, offer.currency)}
          <span className="ml-2 text-xs text-muted-foreground">
            checked {formatRelative(offer.lastCheckedAt)}
          </span>
        </p>
      </button>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={offer.url}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Open URL <ExternalLink className="size-3.5" />
        </a>
        {dismissed ? (
          <Button variant="secondary" size="sm" onClick={onRestore}>
            Restore match
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss wrong match
          </Button>
        )}
      </div>
    </div>
  );
}

export function ProductDetail({ productId }: { productId: string }) {
  const {
    ready,
    getProduct,
    getOffersForProduct,
    getHistoryForOffer,
    dismissOffer,
    restoreOffer,
    setNotifyEnabled,
    runMockPriceCheck,
  } = useWishlistStore();

  const product = getProduct(productId);
  const offers = getOffersForProduct(productId, true);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const selected =
    offers.find((o) => o.id === selectedOfferId) ??
    offers.find((o) => o.status !== "dismissed") ??
    offers[0];

  const history = selected ? getHistoryForOffer(selected.id) : [];

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse">
        Loading product…
      </p>
    );
  }

  if (!product) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Product not found</AlertTitle>
        <AlertDescription>
          It may have been removed.{" "}
          <Link href="/wishlist" className="underline">
            Back to wishlist
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  async function onCheck() {
    setChecking(true);
    await new Promise((r) => setTimeout(r, 600));
    runMockPriceCheck(productId);
    setChecking(false);
  }

  return (
    <div className="space-y-6">
      <Link
        href="/wishlist"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Wishlist
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative mx-auto aspect-square w-40 shrink-0 overflow-hidden rounded-xl bg-muted sm:mx-0 sm:w-48">
          <Image
            src={product.imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="192px"
            priority
          />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            {product.brand ? (
              <p className="text-xs font-medium tracking-wide text-teal-800 uppercase">
                {product.brand}
              </p>
            ) : null}
            <h1 className="font-heading text-2xl leading-tight tracking-tight text-teal-950 sm:text-3xl">
              {product.title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Added from search “{product.queryText}” ·{" "}
              {formatRelative(product.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNotifyEnabled(product.id, !product.notifyEnabled)}
            >
              {product.notifyEnabled ? (
                <>
                  <BellRing className="size-4" /> Alerts on
                </>
              ) : (
                <>
                  <BellOff className="size-4" /> Alerts off
                </>
              )}
            </Button>
            <Button
              size="sm"
              className="bg-teal-800 hover:bg-teal-700"
              onClick={onCheck}
              disabled={checking}
            >
              <RefreshCw className={cn("size-4", checking && "animate-spin")} />
              {checking ? "Checking…" : "Mock price check"}
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      <Tabs defaultValue="sources">
        <TabsList>
          <TabsTrigger value="sources">Tracked sources</TabsTrigger>
          <TabsTrigger value="history">Price history</TabsTrigger>
        </TabsList>
        <TabsContent value="sources" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Amazon and eBay are stub adapters. The generic listing is often a
            wrong match — dismiss it to filter your view.
          </p>
          {offers.length === 0 ? (
            <Alert>
              <AlertTitle>No sources yet</AlertTitle>
              <AlertDescription>
                Offer discovery returned nothing for this product.
              </AlertDescription>
            </Alert>
          ) : (
            offers.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                selected={selected?.id === offer.id}
                onSelect={() => setSelectedOfferId(offer.id)}
                onDismiss={() => dismissOffer(offer.id)}
                onRestore={() => restoreOffer(offer.id)}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-4 space-y-4">
          {selected ? (
            <>
              <p className="text-sm">
                Showing history for{" "}
                <span className="font-medium">{selected.merchant}</span> ·{" "}
                {SOURCE_LABELS[selected.sourceId]}
              </p>
              <PriceHistoryChart points={history} />
              <ul className="max-h-48 space-y-1 overflow-auto text-sm">
                {[...history].reverse().slice(0, 8).map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between border-b border-border/50 py-1.5"
                  >
                    <span className="text-muted-foreground">
                      {new Date(p.capturedAt).toLocaleDateString()}
                    </span>
                    <span>{formatMoney(p.price, p.currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select a source first.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
