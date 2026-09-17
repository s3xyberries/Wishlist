# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Search products via live scrape (or SerpAPI), confirm the right match, track Amazon/eBay/official sources, review price history, and see in-app alerts.

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

- Product search via `/api/search`: **shared catalog first** (6h TTL) → SerpAPI → Google Shopping HTML → Amazon search → mapped official brand PDPs. `?refresh=1` forces a re-scrape.
- Shared catalog browse at `/catalog` and `/api/catalog` (server file store under `.data/`)
- Confirm / intercept step before adding to the wishlist
- On track: `/api/discover` scrapes Amazon + eBay (or eBay Browse API) and mapped official PDPs — live offers only
- Wishlist with notify toggle and remove
- Product detail: tracked sources, dismiss/restore wrong matches
- User-triggered “Check live price” via `/api/price-check` (scrape/API only; failures surface as alerts, not fake prices)
- In-app notifications feed (localStorage)
- PWA manifest + basic service worker shell

## Shared catalog

Successful search scrapes are written to `.data/shared-catalog.json` (gitignored). Later searches with the same (or token-matching) query reuse those rows while fresh — UI badges show **From catalog** vs **Fresh scrape**. Force refresh updates the catalog. This is shared across users on the same server instance, not mock data.

## Scrape policy (important)

Live HTML fetches are **user-initiated only** (search, track/discover, manual price check). There is **no cron / bulk scrape** and **no mock/stub fallback data**. Shared catalog reuse is the primary way we avoid repeat scrapes. Requests use a polite User-Agent, short timeouts, per-host rate limits, and a short in-memory cache. Retailer ToS may still disallow scraping — prefer official APIs when you have keys.

## Live sources

| Piece | Status |
|-------|--------|
| Google Shopping | SerpAPI if `SERPAPI_API_KEY`; else Google HTML; else Amazon search scrape; else mapped official PDPs |
| Amazon offers / prices | Light search/product HTML with title scoring (avoids accessory false matches) |
| eBay offers / prices | Browse API if credentials; else light HTML (often 403 from cloud IPs) |
| Official / generic | Mapped official PDPs (e.g. Bambu Lab store) scraped via JSON-LD — also used as search fallback |
| Push / email alerts | In-app feed only |

Wishlist state persists in `localStorage` (`pricekeep-state-v3-scrape-only`).

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
