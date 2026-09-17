# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Defaults to **Australia (AUD)** with a region switcher (AU/US). Search via live scrape (or SerpAPI), confirm the right match, track Amazon/eBay/official sources, review price history, and see in-app alerts.

Canonical GitHub repo: **https://github.com/s3xyberries/Wishlist**

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

`npm run dev` uses **webpack** and allows `127.0.0.1` via `allowedDevOrigins`. Prefer:

```bash
npm run build && npm start   # production mode on the same port (most reliable)
npm run lint
npm run price-check:daily    # one-shot recheck of tracked offers
npm run scheduler            # local daily cron (06:00 + boot run)
```

## What works now

- **Region switcher (AU default / US)** — currency, Google `gl`, Amazon/eBay hosts, and official PDPs follow the active region
- Product search via `/api/search?region=au`: **SQLite catalog first** (6h TTL) → SerpAPI → Google Shopping → Amazon (.com.au) → official brand PDPs. `?refresh=1` forces a re-scrape
- Shared catalog browse at `/catalog` (region-scoped)
- Confirm / intercept step before adding to the wishlist
- **Paste a product URL** on Wishlist (or product sources) → scrape title/price → track + daily recheck
- On track: `/api/discover` scrapes regional Amazon + eBay + official PDPs; registers offers for the daily scheduler
- Wishlist with notify toggle and remove
- Product detail: tracked sources, dismiss/restore wrong matches
- User-triggered “Check live price” via `/api/price-check`
- Daily scheduler: `npm run price-check:daily` or `GET /api/scheduler/run`
- In-app notifications feed (localStorage) + PWA shell

## Shared catalog (SQLite)

Successful scrapes land in **`.data/pricekeep.sqlite`** (not JSON). Legacy `.data/shared-catalog.json` is migrated once on startup. Catalog rows are keyed by **region**; TTL reuse is per-region. UI badges show **From catalog** vs **Fresh scrape**.

## Scrape policy (important)

Live HTML fetches are **user-initiated** (search, track/discover, manual price check) plus the **optional daily scheduler** for already-tracked offers. There is **no mock/stub fallback data**. Shared catalog reuse avoids repeat scrapes. Requests use a polite User-Agent, short timeouts, per-host rate limits, and a short in-memory cache.

## Live sources (AU default)

| Piece | AU | US |
|-------|----|----|
| Currency | AUD | USD |
| Google Shopping | `gl=au` | `gl=us` |
| Amazon | amazon.com.au | amazon.com |
| eBay | ebay.com.au | ebay.com |
| Official / generic | au.store.bambulab.com (etc.) | us.store.bambulab.com |
| Push / email alerts | In-app feed only | same |

Wishlist state persists in `localStorage` (`pricekeep-state-v4-au-regions`).

## Optional env

Copy `.env.example` → `.env.local`. All keys are optional.

```bash
SERPAPI_API_KEY=
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_PARTNER_TAG=
SCHEDULER_SECRET=          # optional guard for /api/scheduler/run
PRICE_CHECK_CRON=0 6 * * * # for npm run scheduler
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · cheerio · `node:sqlite` · node-cron (dev scheduler) · localStorage

## Migration note

App source lives on GitHub at [s3xyberries/Wishlist](https://github.com/s3xyberries/Wishlist) (`main`).
