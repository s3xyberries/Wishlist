"use client";

import Image from "next/image";
import Link from "next/link";
import { BellOff, BellRing, Trash2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatMoney, formatRelative } from "@/lib/format";
import { useWishlistStore } from "@/lib/store";

export function WishlistView() {
  const { ready, state, getOffersForProduct, removeProduct, setNotifyEnabled } =
    useWishlistStore();

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse">
        Loading your wishlist…
      </p>
    );
  }

  if (state.products.length === 0) {
    return (
      <Alert>
        <AlertTitle>Wishlist is empty</AlertTitle>
        <AlertDescription>
          <Link href="/" className="underline underline-offset-2">
            Search for a product
          </Link>{" "}
          and confirm it to start tracking prices.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ul className="space-y-3">
      {state.products.map((product) => {
        const activeOffers = getOffersForProduct(product.id, false);
        const best = activeOffers.reduce<(typeof activeOffers)[number] | null>(
          (acc, o) => (!acc || o.lastPrice < acc.lastPrice ? o : acc),
          null,
        );
        return (
          <li
            key={product.id}
            className="flex flex-col gap-3 rounded-xl border border-border/80 bg-background/70 p-3 sm:flex-row sm:items-center sm:p-4"
          >
            <Link
              href={`/product/${product.id}`}
              className="flex min-w-0 flex-1 gap-3"
            >
              <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted sm:size-20">
                <Image
                  src={product.imageUrl}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="80px"
                />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="truncate font-medium">{product.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {product.brand ? <Badge variant="secondary">{product.brand}</Badge> : null}
                  <span>{activeOffers.length} active sources</span>
                  <span>Added {formatRelative(product.createdAt)}</span>
                </div>
                {best ? (
                  <p className="text-sm text-teal-900">
                    Best tracked: {formatMoney(best.lastPrice, best.currency)} on{" "}
                    {best.merchant}
                  </p>
                ) : (
                  <p className="text-sm text-amber-800">
                    All sources dismissed — restore one on the product page.
                  </p>
                )}
              </div>
            </Link>
            <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
              <Button
                variant="ghost"
                size="icon"
                aria-label={
                  product.notifyEnabled ? "Disable alerts" : "Enable alerts"
                }
                onClick={() => setNotifyEnabled(product.id, !product.notifyEnabled)}
              >
                {product.notifyEnabled ? (
                  <BellRing className="size-4 text-teal-800" />
                ) : (
                  <BellOff className="size-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove from wishlist"
                onClick={() => removeProduct(product.id)}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
