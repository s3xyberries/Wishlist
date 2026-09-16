import type { Metadata } from "next";
import { WishlistView } from "@/components/wishlist-view";

export const metadata: Metadata = {
  title: "Wishlist",
};

export default function WishlistPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl tracking-tight text-teal-950">
          Wishlist
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Products you confirmed and are tracking across sources.
        </p>
      </div>
      <WishlistView />
    </div>
  );
}
