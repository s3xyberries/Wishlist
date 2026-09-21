# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Defaults to **Australia (AUD)** with a region switcher (AU/US). Search via live scrape (or SerpAPI), confirm the right match, track Amazon/eBay/official sources, review price history, and see in-app alerts.

Canonical GitHub repo: **https://github.com/s3xyberries/Wishlist**

## Requirements

- **Node.js >= 20** (22+ recommended). `engines.node` is `>=20`.
- Shared catalog uses **`better-sqlite3`** (portable native driver). We do **not** use Node’s built-in `node:sqlite` — that module is missing on many Windows builds even on Node 22.
- **Windows + better-sqlite3:** `npm install` must succeed so the native addon is present (prebuild or compile). If install/build fails, install [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Desktop C++ workload) and retry `npm install`. Production builds use **`next build --webpack`** (not Turbopack) so Next does not try to bundle the native module.

## Run locally

### Windows (double-click)

1. Install [Node.js 20+](https://nodejs.org) (22+ recommended).
2. Double-click **`run.bat`** in the project folder (or right-click **`run.ps1`** → Run with PowerShell). Paths with spaces (e.g. `Desktop\Price Checker\Wishlist`) are fine — the launcher `cd`s into its own folder.
3. Each launch runs **`npm install`**, then **`npm run build`** when `.next\BUILD_ID` is missing, and only starts after the build succeeds. Then it opens [http://127.0.0.1:43127](http://127.0.0.1:43127) (IPv4 loopback — the server also binds to `127.0.0.1`).
4. Leave the console window open while you use Pricekeep. If it prints **SERVER DIED**, the Node process exited — that is why the browser shows NetworkError / unable to connect. Read the message in that window.
5. If you see **“Could not find a production build”** or **“Can't resolve 'better-sqlite3'”**, delete `.next` (and `node_modules` if the module is missing), ensure VS Build Tools are installed, then double-click `run.bat` again. Do **not** run `next build` with Turbopack on Windows for this app.
6. If Next warns that it ignored `package-lock.json` because of a file under `C:\Users\<you>\`, delete that **stray** `C:\Users\<you>\package-lock.json` (not the one inside this repo). `outputFileTracingRoot` in `next.config.ts` also pins the app to this project folder.

### Disk size (~600MB)

Almost all of that is **local** `node_modules` + `.next` (not Git). Safe cleanup:

```bash
npm run clean        # delete .next (+ caches)
npm run clean:all    # also delete node_modules → then npm install
```

Do **not** delete `.git`. Optional: delete `.data/` to reset the SQLite catalog only.

macOS/Linux: `chmod +x run.sh && ./run.sh` (same install → build → start flow).

### From a terminal

```bash
git pull
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

`npm run dev` uses **webpack** and allows `127.0.0.1` via `allowedDevOrigins`. Prefer:

```bash
npm run build && npm start   # webpack production build + start (what run.bat uses; avoids Turbopack/native issues)
npm run lint
npm run price-check:daily    # one-shot recheck of tracked offers
npm run scheduler            # local daily cron (06:00 + boot run)
```

### Search troubleshooting

If search shows an error, the UI now surfaces the real `/api/search` HTTP status and JSON `error`/`note` (not a vague “could not reach” message).

1. Confirm the server is up on port **43127** (`npm run dev` or `npm start`).
2. Hit [http://127.0.0.1:43127/api/health](http://127.0.0.1:43127/api/health) — should report `catalog.driver: "better-sqlite3"` and `catalog.available: true`.
3. Hit [http://127.0.0.1:43127/api/search?q=bambu%20lab%20h2s&region=au](http://127.0.0.1:43127/api/search?q=bambu%20lab%20h2s&region=au) directly in the browser — you must see **JSON**, not an HTML page.
4. If the UI says **NetworkError** / unable to connect: the **server process is down**. Check the `run.bat` window for **SERVER DIED**. Confirm [http://127.0.0.1:43127/api/ping](http://127.0.0.1:43127/api/ping) — if the browser cannot connect, restart `run.bat` and leave it open. Also try `node -e "require('better-sqlite3')"` in that folder.
5. If ping works but search fails with HTML: hard-refresh (Ctrl+Shift+R). Local loopback disables service workers.
6. If `better-sqlite3` failed to build: `npm run clean:all`, install VS Build Tools if needed, `npm install`, then `run.bat`.
7. Prefer `http://127.0.0.1:43127` over `http://localhost:43127` so the host matches `run.bat`.

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

## Shared catalog (SQLite via better-sqlite3)

Successful scrapes land in **`.data/pricekeep.sqlite`**. Driver: **`better-sqlite3`** (not `node:sqlite`). Legacy `.data/shared-catalog.json` is migrated once on startup. Catalog rows are keyed by **region**; TTL reuse is per-region. UI badges show **From catalog** vs **Fresh scrape**. If the catalog cannot open, search still attempts a live scrape and shows a warning.

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

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · cheerio · **better-sqlite3** · node-cron (dev scheduler) · localStorage

## Migration note

App source lives on GitHub at [s3xyberries/Wishlist](https://github.com/s3xyberries/Wishlist) (`main`).
