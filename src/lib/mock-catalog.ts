import type { SearchResult } from "./types";

/** Seed catalog used when Google Shopping / SerpAPI keys are absent. */
export const MOCK_CATALOG: SearchResult[] = [
  {
    id: "sr-sony-wh1000xm5",
    title: "Sony WH-1000XM5 Wireless Noise Cancelling Headphones",
    brand: "Sony",
    imageUrl:
      "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 328.0,
    currency: "USD",
    merchantHint: "Multiple sellers",
    sourceHint: "shopping",
    rating: 4.7,
    reviewCount: 18420,
  },
  {
    id: "sr-kindle-paperwhite",
    title: "Amazon Kindle Paperwhite (16 GB) — Black",
    brand: "Amazon",
    imageUrl:
      "https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 139.99,
    currency: "USD",
    merchantHint: "Amazon",
    sourceHint: "amazon",
    rating: 4.6,
    reviewCount: 90211,
  },
  {
    id: "sr-dyson-v15",
    title: "Dyson V15 Detect Cordless Vacuum",
    brand: "Dyson",
    imageUrl:
      "https://images.unsplash.com/photo-1558317374-067fb5f30001?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 649.99,
    currency: "USD",
    merchantHint: "Best Buy & others",
    sourceHint: "shopping",
    rating: 4.5,
    reviewCount: 6120,
  },
  {
    id: "sr-nike-pegasus",
    title: "Nike Pegasus 41 Men's Road Running Shoes",
    brand: "Nike",
    imageUrl:
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 129.99,
    currency: "USD",
    merchantHint: "Nike, Foot Locker",
    sourceHint: "shopping",
    rating: 4.4,
    reviewCount: 3340,
  },
  {
    id: "sr-ipad-air",
    title: "Apple iPad Air 11-inch (M3) 128GB Wi-Fi",
    brand: "Apple",
    imageUrl:
      "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 599.0,
    currency: "USD",
    merchantHint: "Apple Store & retailers",
    sourceHint: "shopping",
    rating: 4.8,
    reviewCount: 12890,
  },
  {
    id: "sr-lego-icons",
    title: "LEGO Icons Botanicals Dried Flower Centerpiece",
    brand: "LEGO",
    imageUrl:
      "https://images.unsplash.com/photo-1587654780291-39c9404d745b?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 49.99,
    currency: "USD",
    merchantHint: "LEGO, Target",
    sourceHint: "shopping",
    rating: 4.9,
    reviewCount: 2104,
  },
  {
    id: "sr-instant-pot",
    title: "Instant Pot Duo Plus 9-in-1 Electric Pressure Cooker, 6 Qt",
    brand: "Instant Pot",
    imageUrl:
      "https://images.unsplash.com/photo-1585515320310-259814833e27?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 99.95,
    currency: "USD",
    merchantHint: "Amazon, Walmart",
    sourceHint: "shopping",
    rating: 4.6,
    reviewCount: 54002,
  },
  {
    id: "sr-garmin-forerunner",
    title: "Garmin Forerunner 265 GPS Running Smartwatch",
    brand: "Garmin",
    imageUrl:
      "https://images.unsplash.com/photo-1579586337278-3befd40fd17a?auto=format&fit=crop&w=400&h=400&q=80",
    priceSnippet: 399.99,
    currency: "USD",
    merchantHint: "Garmin, REI",
    sourceHint: "shopping",
    rating: 4.7,
    reviewCount: 4890,
  },
  {
    id: "sr-bambu-h2s",
    title: "Bambu Lab H2S 3D Printer",
    brand: "Bambu Lab",
    imageUrl:
      "https://store.bblcdn.com/s7/default/0de3d0b45e7d43adbd9c39e8a7f098b1/H2S-compressed.jpg",
    priceSnippet: 1399.0,
    currency: "USD",
    merchantHint: "Bambu Lab official store",
    sourceHint: "shopping",
    rating: 4.8,
    reviewCount: 1200,
  },
];

function normalizeSearchTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .replace(/bambulabs/g, "bambu lab")
    .replace(/bambu-lab/g, "bambu lab")
    .split(/\s+/)
    .filter(Boolean);
}

export function searchMockCatalog(query: string): SearchResult[] {
  const tokens = normalizeSearchTokens(query);
  if (!tokens.length) return [];
  return MOCK_CATALOG.filter((item) => {
    const hay = `${item.title} ${item.brand ?? ""} ${item.merchantHint}`.toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}
