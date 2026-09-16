"use client";

import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { useWishlistStore } from "@/lib/store";
import type { NotificationKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const kindLabel: Record<NotificationKind, string> = {
  price_drop: "Price drop",
  price_rise: "Price rise",
  source_added: "Sources",
  welcome: "Welcome",
};

export function NotificationsView() {
  const {
    ready,
    state,
    markNotificationRead,
    markAllNotificationsRead,
  } = useWishlistStore();

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse">
        Loading alerts…
      </p>
    );
  }

  if (state.notifications.length === 0) {
    return (
      <Alert>
        <AlertTitle>No alerts yet</AlertTitle>
        <AlertDescription>
          Run a mock price check on a product, or add something from search.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={markAllNotificationsRead}>
          Mark all read
        </Button>
      </div>
      <ul className="space-y-2">
        {state.notifications.map((n) => (
          <li
            key={n.id}
            className={cn(
              "rounded-lg border border-border/80 p-3 transition-colors",
              n.read ? "bg-background/50" : "bg-teal-50/70",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{kindLabel[n.kind]}</Badge>
              <span className="text-xs text-muted-foreground">
                {formatRelative(n.createdAt)}
              </span>
              {!n.read ? (
                <Badge className="bg-teal-800 text-white hover:bg-teal-800">
                  New
                </Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-relaxed">{n.message}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {n.productId ? (
                <Link
                  href={`/product/${n.productId}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  View product
                </Link>
              ) : null}
              {!n.read ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markNotificationRead(n.id)}
                >
                  Mark read
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Stub only — web push / email delivery is not wired. Alerts stay in this
        in-app feed and localStorage.
      </p>
    </div>
  );
}
