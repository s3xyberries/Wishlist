"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { productFromResult } from "./adapters";
import { uid } from "./format";
import { DEFAULT_REGION_ID, REGION_COOKIE, isRegionId } from "./region/config";
import type {
  AppState,
  NotificationEvent,
  Offer,
  PricePoint,
  Product,
  SearchResult,
} from "./types";

/** Bump key to drop old seeded/mock localStorage payloads. */
const STORAGE_KEY = "pricekeep-state-v4-au-regions";

function readClientRegion(): string {
  if (typeof document === "undefined") return DEFAULT_REGION_ID;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${REGION_COOKIE}=`));
  const value = match?.split("=")[1];
  return isRegionId(value) ? value : DEFAULT_REGION_ID;
}

const EMPTY_STATE: AppState = {
  products: [],
  offers: [],
  priceHistory: [],
  notifications: [],
};

function isAppState(value: unknown): value is AppState {
  if (!value || typeof value !== "object") return false;
  const v = value as AppState;
  return (
    Array.isArray(v.products) &&
    Array.isArray(v.offers) &&
    Array.isArray(v.priceHistory) &&
    Array.isArray(v.notifications)
  );
}

interface WishlistStoreValue {
  ready: boolean;
  state: AppState;
  unreadCount: number;
  trackProduct: (result: SearchResult, queryText: string) => string;
  dismissOffer: (offerId: string) => void;
  restoreOffer: (offerId: string) => void;
  removeProduct: (productId: string) => void;
  setNotifyEnabled: (productId: string, enabled: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  runPriceCheck: (productId: string) => void;
  getProduct: (id: string) => Product | undefined;
  getOffersForProduct: (productId: string, includeDismissed?: boolean) => Offer[];
  getHistoryForOffer: (offerId: string) => PricePoint[];
}

const WishlistStoreContext = createContext<WishlistStoreValue | null>(null);

export function WishlistStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    // Defer so we don't sync-setState during the effect body (React Compiler lint).
    const id = window.setTimeout(() => {
      if (cancelled) return;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isAppState(parsed)) {
            setState(parsed);
          }
        }
      } catch {
        // keep empty
      }
      setReady(true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // quota / private mode
    }
  }, [state, ready]);

  const trackProduct = useCallback((result: SearchResult, queryText: string) => {
    const now = new Date().toISOString();
    const product = productFromResult(result, queryText, now);
    const notifs: NotificationEvent[] = [
      {
        id: uid("notif"),
        productId: product.id,
        kind: "source_added",
        message: `Tracking ${product.title} — discovering live sources…`,
        createdAt: now,
        read: false,
      },
    ];
    setState((prev) => ({
      products: [product, ...prev.products],
      offers: prev.offers,
      priceHistory: prev.priceHistory,
      notifications: [...notifs, ...prev.notifications],
    }));

    void (async () => {
      const region = readClientRegion();
      try {
        const res = await fetch("/api/discover", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-pricekeep-region": region,
          },
          body: JSON.stringify({
            product: result,
            productId: product.id,
            region,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          offers?: Offer[];
          modes?: { amazon?: string; ebay?: string; generic?: string };
          notes?: string[];
        };
        const liveOffers = (data.offers ?? []).filter(
          (o) => typeof o.lastPrice === "number" && o.lastPrice > 0,
        );
        if (liveOffers.length) {
          void fetch("/api/tracked-offers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              region,
              offers: liveOffers.map((o) => ({
                id: o.id,
                sourceId: o.sourceId,
                url: o.url,
                title: o.title,
                merchant: o.merchant,
                currency: o.currency,
                lastPrice: o.lastPrice,
                lastCheckedAt: o.lastCheckedAt,
                productId: product.id,
                productTitle: product.title,
                notifyEnabled: true,
              })),
            }),
          });
        }
        const liveHistory: PricePoint[] = liveOffers.map((o) => ({
          id: uid("pp"),
          offerId: o.id,
          price: o.lastPrice,
          currency: o.currency,
          capturedAt: o.lastCheckedAt || new Date().toISOString(),
          source: "poll",
        }));
        const liveSources = [
          data.modes?.amazon === "scrape" || data.modes?.amazon === "api"
            ? "Amazon"
            : null,
          data.modes?.ebay === "scrape" || data.modes?.ebay === "api"
            ? "eBay"
            : null,
          data.modes?.generic === "scrape" ? "official store" : null,
        ].filter(Boolean);

        setState((prev) => {
          const withoutOffers = prev.offers.filter((o) => o.productId !== product.id);
          const withoutHistory = prev.priceHistory.filter(
            (p) => !prev.offers.some((o) => o.productId === product.id && o.id === p.offerId),
          );
          const extra: NotificationEvent = {
            id: uid("notif"),
            productId: product.id,
            kind: "source_added",
            message: liveOffers.length
              ? `Found ${liveOffers.length} live source${liveOffers.length === 1 ? "" : "s"}${liveSources.length ? ` (${liveSources.join(", ")})` : ""}.`
              : `No live sources found for ${product.title}. Try again later or another query.`,
            createdAt: new Date().toISOString(),
            read: false,
          };
          return {
            ...prev,
            offers: [...liveOffers, ...withoutOffers],
            priceHistory: [...liveHistory, ...withoutHistory],
            notifications: [extra, ...prev.notifications],
          };
        });
      } catch {
        setState((prev) => ({
          ...prev,
          notifications: [
            {
              id: uid("notif"),
              productId: product.id,
              kind: "source_added",
              message: `Live discovery failed for ${product.title}.`,
              createdAt: new Date().toISOString(),
              read: false,
            },
            ...prev.notifications,
          ],
        }));
      }
    })();

    return product.id;
  }, []);

  const dismissOffer = useCallback((offerId: string) => {
    setState((prev) => ({
      ...prev,
      offers: prev.offers.map((o) =>
        o.id === offerId ? { ...o, status: "dismissed" } : o,
      ),
    }));
  }, []);

  const restoreOffer = useCallback((offerId: string) => {
    setState((prev) => ({
      ...prev,
      offers: prev.offers.map((o) =>
        o.id === offerId ? { ...o, status: "active" } : o,
      ),
    }));
  }, []);

  const removeProduct = useCallback((productId: string) => {
    setState((prev) => {
      const offerIds = new Set(
        prev.offers.filter((o) => o.productId === productId).map((o) => o.id),
      );
      return {
        products: prev.products.filter((p) => p.id !== productId),
        offers: prev.offers.filter((o) => o.productId !== productId),
        priceHistory: prev.priceHistory.filter((p) => !offerIds.has(p.offerId)),
        notifications: prev.notifications.filter((n) => n.productId !== productId),
      };
    });
  }, []);

  const setNotifyEnabled = useCallback((productId: string, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === productId ? { ...p, notifyEnabled: enabled } : p,
      ),
    }));
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) => ({ ...n, read: true })),
    }));
  }, []);

  const runPriceCheck = useCallback((productId: string) => {
    const snapshot = stateRef.current;
    const product = snapshot.products.find((p) => p.id === productId);
    const target = snapshot.offers.find(
      (o) => o.productId === productId && o.status !== "dismissed",
    );
    if (!product || !target) return;

    void (async () => {
      const now = new Date().toISOString();
      try {
        const res = await fetch("/api/price-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceId: target.sourceId,
            url: target.url,
            currency: target.currency,
          }),
        });
        if (!res.ok) throw new Error("price-check failed");
        const data = (await res.json()) as {
          price?: number | null;
          mode?: string;
          note?: string;
        };
        if (data.mode !== "scrape" && data.mode !== "api") {
          setState((prev) => ({
            ...prev,
            notifications: product.notifyEnabled
              ? [
                  {
                    id: uid("notif"),
                    productId,
                    offerId: target.id,
                    kind: "price_rise",
                    message: `${target.merchant}: live price check failed${data.note ? ` — ${data.note}` : ""}.`,
                    createdAt: now,
                    read: false,
                  },
                  ...prev.notifications,
                ]
              : prev.notifications,
          }));
          return;
        }
        if (typeof data.price !== "number") return;

        const newPrice = data.price;
        const dropped = newPrice < target.lastPrice;
        const newPoint: PricePoint = {
          id: uid("pp"),
          offerId: target.id,
          price: newPrice,
          currency: target.currency,
          capturedAt: now,
          source: "poll",
        };
        const notif: NotificationEvent = {
          id: uid("notif"),
          productId,
          offerId: target.id,
          kind: dropped ? "price_drop" : "price_rise",
          message: `${target.merchant} price for ${product.title} is $${newPrice.toFixed(2)} (live scrape).`,
          createdAt: now,
          read: false,
        };

        setState((prev) => ({
          ...prev,
          offers: prev.offers.map((o) =>
            o.id === target.id
              ? { ...o, lastPrice: newPrice, lastCheckedAt: now }
              : o.productId === productId
                ? { ...o, lastCheckedAt: now }
                : o,
          ),
          priceHistory: [...prev.priceHistory, newPoint],
          notifications: product.notifyEnabled
            ? [notif, ...prev.notifications]
            : prev.notifications,
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          notifications: [
            {
              id: uid("notif"),
              productId,
              offerId: target.id,
              kind: "price_rise",
              message: `Live price check failed for ${product.title}.`,
              createdAt: now,
              read: false,
            },
            ...prev.notifications,
          ],
        }));
      }
    })();
  }, []);

  const getProduct = useCallback(
    (id: string) => state.products.find((p) => p.id === id),
    [state.products],
  );

  const getOffersForProduct = useCallback(
    (productId: string, includeDismissed = true) =>
      state.offers.filter(
        (o) =>
          o.productId === productId &&
          (includeDismissed || o.status !== "dismissed"),
      ),
    [state.offers],
  );

  const getHistoryForOffer = useCallback(
    (offerId: string) =>
      state.priceHistory
        .filter((p) => p.offerId === offerId)
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)),
    [state.priceHistory],
  );

  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.read).length,
    [state.notifications],
  );

  const value: WishlistStoreValue = {
    ready,
    state,
    unreadCount,
    trackProduct,
    dismissOffer,
    restoreOffer,
    removeProduct,
    setNotifyEnabled,
    markNotificationRead,
    markAllNotificationsRead,
    runPriceCheck,
    getProduct,
    getOffersForProduct,
    getHistoryForOffer,
  };

  return (
    <WishlistStoreContext.Provider value={value}>
      {children}
    </WishlistStoreContext.Provider>
  );
}

export function useWishlistStore() {
  const ctx = useContext(WishlistStoreContext);
  if (!ctx) {
    throw new Error("useWishlistStore must be used within WishlistStoreProvider");
  }
  return ctx;
}
