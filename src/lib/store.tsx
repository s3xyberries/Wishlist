"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  candidatesToOffers,
  discoverOffers,
  productFromResult,
} from "./adapters";
import { uid } from "./format";
import type {
  AppState,
  NotificationEvent,
  Offer,
  PricePoint,
  Product,
  SearchResult,
} from "./types";

const STORAGE_KEY = "pricekeep-state-v1";

const EMPTY_STATE: AppState = {
  products: [],
  offers: [],
  priceHistory: [],
  notifications: [],
};

/** Fixed anchor so seed data is deterministic (avoids SSR/client hydration mismatch). */
const SEED_NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

function daysBeforeSeed(n: number) {
  return new Date(SEED_NOW - n * 24 * 60 * 60 * 1000).toISOString();
}

function buildHistory(
  offerId: string,
  endPrice: number,
  currency: string,
): PricePoint[] {
  const points: PricePoint[] = [];
  let price = endPrice * 1.18;
  let step = 0;
  for (let i = 28; i >= 0; i -= 2) {
    // Deterministic wobble instead of Math.random()
    const factor = 0.985 + ((step % 5) * 0.004);
    price = Math.round(price * factor * 100) / 100;
    if (i === 0) price = endPrice;
    points.push({
      id: `pp-${offerId}-${i}`,
      offerId,
      price,
      currency,
      capturedAt: daysBeforeSeed(i),
      source: "seed",
    });
    step += 1;
  }
  return points;
}

function createSeedState(): AppState {
  const now = new Date(SEED_NOW).toISOString();
  const product: Product = {
    id: "prod-seed-sony",
    title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    brand: "Sony",
    imageUrl:
      "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=400&h=400&q=80",
    queryText: "sony wh-1000xm5",
    createdAt: daysBeforeSeed(12),
    notifyEnabled: true,
  };

  const offers: Offer[] = [
    {
      id: "offer-sony-amazon",
      productId: product.id,
      sourceId: "amazon",
      title: product.title,
      url: "https://www.amazon.com/s?k=Sony+WH-1000XM5",
      merchant: "Amazon.com",
      currency: "USD",
      status: "active",
      lastPrice: 328,
      lastCheckedAt: daysBeforeSeed(0),
    },
    {
      id: "offer-sony-ebay",
      productId: product.id,
      sourceId: "ebay",
      title: `${product.title} — Refurbished`,
      url: "https://www.ebay.com/sch/i.html?_nkw=Sony+WH-1000XM5",
      merchant: "eBay",
      currency: "USD",
      status: "active",
      lastPrice: 289.5,
      lastCheckedAt: daysBeforeSeed(1),
    },
    {
      id: "offer-sony-generic",
      productId: product.id,
      sourceId: "generic",
      title: "Wireless ANC Over-Ear Headphones (generic listing)",
      url: "https://example-retailer.example/p/sony-wh-1000xm5",
      merchant: "Example Retailer",
      currency: "USD",
      status: "suspected_mismatch",
      lastPrice: 359,
      lastCheckedAt: daysBeforeSeed(2),
    },
  ];

  const priceHistory = offers.flatMap((o) =>
    buildHistory(o.id, o.lastPrice, o.currency),
  );

  const notifications: NotificationEvent[] = [
    {
      id: "notif-welcome",
      kind: "welcome",
      message:
        "Welcome to Pricekeep. Search a product, confirm it, and we will track mock Amazon + eBay sources.",
      createdAt: now,
      read: false,
    },
    {
      id: "notif-drop",
      productId: product.id,
      offerId: "offer-sony-amazon",
      kind: "price_drop",
      message: "Amazon price for Sony WH-1000XM5 dropped $20 to $328.00.",
      createdAt: daysBeforeSeed(1),
      read: false,
    },
  ];

  return { products: [product], offers, priceHistory, notifications };
}

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
  runMockPriceCheck: (productId: string) => void;
  getProduct: (id: string) => Product | undefined;
  getOffersForProduct: (productId: string, includeDismissed?: boolean) => Offer[];
  getHistoryForOffer: (offerId: string) => PricePoint[];
}

const WishlistStoreContext = createContext<WishlistStoreValue | null>(null);

export function WishlistStoreProvider({ children }: { children: ReactNode }) {
  // Empty on SSR + first client paint so markup matches; seed/localStorage load in effect.
  const [state, setState] = useState<AppState>(EMPTY_STATE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let next = createSeedState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isAppState(parsed) && parsed.products.length > 0) {
          next = parsed;
        }
      }
    } catch {
      // keep seed
    }
    setState(next);
    setReady(true);
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
    const candidates = discoverOffers(result);
    const offers = candidatesToOffers(product.id, candidates, now);
    const history = offers.flatMap((o) =>
      buildHistory(o.id, o.lastPrice, o.currency),
    );
    const notifs: NotificationEvent[] = [
      {
        id: uid("notif"),
        productId: product.id,
        kind: "source_added",
        message: `Tracking ${product.title} across Amazon, eBay, and a generic URL match.`,
        createdAt: now,
        read: false,
      },
    ];
    setState((prev) => ({
      products: [product, ...prev.products],
      offers: [...offers, ...prev.offers],
      priceHistory: [...history, ...prev.priceHistory],
      notifications: [...notifs, ...prev.notifications],
    }));
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

  const runMockPriceCheck = useCallback((productId: string) => {
    const now = new Date().toISOString();
    setState((prev) => {
      const product = prev.products.find((p) => p.id === productId);
      if (!product) return prev;

      const activeOffers = prev.offers.filter(
        (o) => o.productId === productId && o.status !== "dismissed",
      );
      if (activeOffers.length === 0) return prev;

      const target = activeOffers[0];
      const drop = Math.round((8 + (target.lastPrice % 17)) * 100) / 100;
      const newPrice = Math.max(1, Math.round((target.lastPrice - drop) * 100) / 100);

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
        kind: "price_drop",
        message: `${target.merchant} price for ${product.title} dropped to $${newPrice.toFixed(2)} (mock check).`,
        createdAt: now,
        read: false,
      };

      return {
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
      };
    });
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
    runMockPriceCheck,
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
