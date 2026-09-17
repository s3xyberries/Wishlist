"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRegion } from "@/lib/region/context";
import { useWishlistStore } from "@/lib/store";

export function AddLinkForm({
  productId,
  onAdded,
  compact = false,
}: {
  /** When set, attach the scraped URL as another source on this product. */
  productId?: string;
  onAdded?: (ids: { productId: string; offerId: string }) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const { region } = useRegion();
  const { trackUrl } = useWishlistStore();
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "error" | "success"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      setStatus("error");
      setMessage("Paste a product page URL first.");
      return;
    }
    try {
      // Basic client validation before hitting the API
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("URL must start with http:// or https://");
      }
    } catch {
      setStatus("error");
      setMessage("Enter a valid http(s) product URL.");
      return;
    }

    setStatus("loading");
    setMessage(`Scraping ${region.shortLabel} page for title and price…`);
    try {
      const result = await trackUrl(trimmed, { productId });
      setStatus("success");
      setMessage(
        productId
          ? `Added “${result.title}” as a tracked source.`
          : `Now tracking “${result.title}”. Daily scheduler will recheck this link.`,
      );
      setUrl("");
      onAdded?.(result);
      if (!productId && !onAdded) {
        window.setTimeout(() => {
          router.push(`/product/${result.productId}`);
        }, 600);
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Could not track that URL.");
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {!compact ? (
        <div>
          <h2 className="text-sm font-medium text-teal-950">Add a product link</h2>
          <p className="text-xs text-muted-foreground">
            Paste any product URL. We scrape the page, save the price, and the
            daily job rechecks it ({region.currency}).
          </p>
        </div>
      ) : null}
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              if (status !== "idle" && status !== "loading") {
                setStatus("idle");
                setMessage(null);
              }
            }}
            placeholder="https://au.store.bambulab.com/products/h2s"
            className="h-10 pl-9"
            aria-label="Product URL"
            disabled={status === "loading"}
            inputMode="url"
            autoComplete="url"
          />
        </div>
        <Button
          type="submit"
          className="h-10 bg-teal-800 hover:bg-teal-700"
          disabled={status === "loading"}
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Scraping…
            </>
          ) : productId ? (
            "Add source"
          ) : (
            "Track link"
          )}
        </Button>
      </form>

      {status === "error" && message ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn’t add link</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {status === "loading" && message ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {message}
        </p>
      ) : null}

      {status === "success" && message ? (
        <Alert>
          <CheckCircle2 className="size-4 text-teal-800" />
          <AlertTitle>Link tracked</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
