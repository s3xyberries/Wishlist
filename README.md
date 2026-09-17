# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Search products, confirm the right match, track Amazon/eBay/generic sources, review price history, and see an in-app alerts stub.

Canonical GitHub repo: **https://github.com/s3xyberries/Wishlist**

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

`npm run dev` uses **webpack** and allows `127.0.0.1` via `allowedDevOrigins`. Next 16 otherwise treats `127.0.0.1` vs `localhost` as cross-origin, blocks `/_next/hmr`, and client hydration never finishes. Prefer:

```bash
npm run build && npm start   # production mode on the same port (most reliable)
npm run lint
```

## What works now

- Product search via `/api/search`: SerpAPI (if key) → light Google Shopping HTML scrape → mock catalog
- Confirm / intercept step before adding to the wishlist
- On track: `/api/discover` tries restrained Amazon + eBay search parsers (or eBay Browse API), else stubs
- Wishlist with notify toggle and remove
- Product detail: tracked sources, dismiss/restore wrong matches
- User-triggered “price check” via `/api/price-check` (scrape when possible, mock drop otherwise)
- In-app notifications feed (localStorage)
- PWA manifest + basic service worker shell

## Scrape policy (important)

Live HTML fetches are **optional, light, and user-initiated only** (search, track/discover, manual price check). There is **no cron / bulk scrape**. Requests use a polite User-Agent, short timeouts, per-host rate limits, and a short in-memory cache. Retailer ToS may still disallow scraping — prefer official APIs when you have keys; mocks always remain the safety net.

## What is mocked vs live

| Piece | Status |
|-------|--------|
| Google Shopping | SerpAPI if `SERPAPI_API_KEY`; else best-effort HTML; else mock |
| Amazon offers / prices | Light search/product HTML when unblocked; else stub |
| eBay offers / prices | Browse API if credentials; else light HTML; else stub |
| Generic retailer | Stub only |
| Push / email alerts | Stub UI only |

Wishlist state persists in `localStorage` (`pricekeep-state-v1`).

## Optional env

Copy `.env.example` → `.env.local`. All keys are optional.

```bash
SERPAPI_API_KEY=           # preferred for Google Shopping
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
AMAZON_ACCESS_KEY=         # reserved for PA-API later
AMAZON_SECRET_KEY=
AMAZON_PARTNER_TAG=
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · cheerio (light parsers) · localStorage

## Migration note

App source lives on GitHub at [s3xyberries/Wishlist](https://github.com/s3xyberries/Wishlist) (`main`). Cloud Agent Cursor remotes may also track a feature branch for the same tree.
