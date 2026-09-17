export type SourceId = "amazon" | "ebay" | "generic";

export type OfferStatus = "active" | "dismissed" | "suspected_mismatch";

export type NotificationKind =
  | "price_drop"
  | "price_rise"
  | "source_added"
  | "welcome";

export interface SearchResult {
  id: string;
  title: string;
  brand?: string;
  imageUrl: string;
  priceSnippet: number;
  currency: string;
  merchantHint: string;
  sourceHint: SourceId | "shopping";
  rating?: number;
  reviewCount?: number;
}

export interface Product {
  id: string;
  title: string;
  brand?: string;
  imageUrl: string;
  queryText: string;
  createdAt: string;
  notifyEnabled: boolean;
}

export interface Offer {
  id: string;
  productId: string;
  sourceId: SourceId;
  title: string;
  url: string;
  merchant: string;
  currency: string;
  status: OfferStatus;
  lastPrice: number;
  lastCheckedAt: string;
}

export interface PricePoint {
  id: string;
  offerId: string;
  price: number;
  currency: string;
  capturedAt: string;
  source: "poll" | "manual";
}

export interface NotificationEvent {
  id: string;
  productId?: string;
  offerId?: string;
  kind: NotificationKind;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface AppState {
  products: Product[];
  offers: Offer[];
  priceHistory: PricePoint[];
  notifications: NotificationEvent[];
}
