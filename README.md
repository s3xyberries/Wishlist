# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Defaults to **Australia (AUD)** with a region switcher (AU/US). Search via **direct Google Shopping HTML scrape** (no API key), then Amazon / official PDPs as fallbacks. Confirm the right match, track sources, review price history, and see in-app alerts.

Canonical GitHub repo: **https://github.com/s3xyberries/Wishlist**

## Requirements

- **Node.js >= 20** (22+ recommended). `engines.node` is `>=20`.
- Shared catalog uses **`sql.js`** (WASM SQLite -- pure JS, **no native addon**). We do **not** use `better-sqlite3` or Node’s `node:sqlite` (both have Windows/Node issues).
- **Windows:** no Visual Studio Build Tools required for the database. `npm install` only needs a normal Node install. Production builds use **`next build --webpack`**.

## Run locally

### Windows (double-click)

1. Install [Node.js 20+](https://nodejs.org) (22+ recommended) and [Git for Windows](https://git-scm.com/download/win).
2. **First time / day-to-day:** double-click **`run.bat`** in the project folder (or right-click **`run.ps1`** → Run with PowerShell). Paths with spaces (e.g. `Desktop\Price Checker\Wishlist`) are fine — the launcher `cd`s into its own folder.
3. **After we push updates:** double-click **`update.bat`** (**Update & Run**). It resets a drifted `package-lock.json`, runs `git pull`, `npm run clean`, `npm install`, installs **Playwright Chromium** (`npx playwright install chromium`), rebuilds, starts the app on [http://127.0.0.1:43127](http://127.0.0.1:43127), and opens the browser. PowerShell mirror: `update.ps1`. macOS/Linux: `chmod +x update.sh && ./update.sh`.
4. Each `run.bat` launch runs **`npm install`**, then **`npm run build`** when `.next\BUILD_ID` is missing, and only starts after the build succeeds. If the checkout is behind GitHub, `run.bat` prints a tip to use `update.bat`.
5. Leave the console window open while you use Pricekeep. If it prints **SERVER DIED**, the Node process exited — that is why the browser shows NetworkError / unable to connect. Read the message in that window.
6. If you see **“Could not find a production build”**, double-click `update.bat` (or delete `.next` and run `run.bat` again).
7. If Next warns that it ignored `package-lock.json` because of a file under `C:\Users\<you>\`, delete that **stray** `C:\Users\<you>\package-lock.json` (not the one inside this repo).
8. Google Shopping: plain HTTP first; if Google returns a JS shell, Pricekeep retries with **headless Chromium**. First run needs Chromium via `update.bat` or `npm run playwright:install`.

### Disk size (~600MB)

Almost all of that is **local** `node_modules` + `.next` (not Git). Safe cleanup:

```bash
npm run clean        # delete .next (+ caches)
npm run clean:all    # also delete node_modules → then npm install
```

Do **not** delete `.git`. Optional: delete `.data/` to reset the SQLite catalog only.

macOS/Linux: `chmod +x run.sh && ./run.sh` (same install → build → start flow). For updates: `./update.sh`.

### From a terminal

Prefer **`update.bat`** / **`./update.sh`** instead of hand-running:

```bash
git pull
npm run clean
npm install
npm run build && npm start
```

Or for a quick dev loop:

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
2. Hit [http://127.0.0.1:43127/api/health](http://127.0.0.1:43127/api/health) -- should report `catalog.driver: "sql.js"` and `catalog.available: true`.
3. Hit [http://127.0.0.1:43127/api/search?q=bambu%20lab%20h2s&region=au](http://127.0.0.1:43127/api/search?q=bambu%20lab%20h2s&region=au) directly -- you must see **JSON**, not an HTML page.
4. If the UI says **NetworkError** / unable to connect: the **server process is down**. Check the `run.bat` window for **SERVER DIED**. Confirm [http://127.0.0.1:43127/api/ping](http://127.0.0.1:43127/api/ping) -- if the browser cannot connect, restart `run.bat` and leave it open.
5. If ping works but search fails with HTML: hard-refresh (Ctrl+Shift+R). Local loopback disables service workers.
6. Prefer `http://127.0.0.1:43127` over `http://localhost:43127` so the host matches `run.bat`.

Exit code **`-1073741819`** (`0xC0000005` ACCESS_VIOLATION) was caused by the old **native** `better-sqlite3` addon on Windows -- not by broken API route files. This build uses **sql.js** instead.

## What works now

- **Region switcher (AU default / US)** — currency, Google `gl`, Amazon/eBay hosts, and official PDPs follow the active region
- Product search via `/api/search?region=au`: **SQLite catalog first** (6h TTL) → **Google Shopping HTTP scrape** → **Playwright Chromium** if JS shell/captcha → Amazon (.com.au) → official brand PDPs. `?refresh=1` forces a re-scrape. SerpAPI is optional and never required.
- Response JSON includes `googleStatus` / `googleNote` when Google was attempted (`ok`, `js_required`, `captcha`, …). Mode `browser-scrape` means headless Chromium succeeded.
- Shared catalog browse at `/catalog` (region-scoped)
- Confirm / intercept step before adding to the wishlist
- **Paste a product URL** on Wishlist (or product sources) → scrape title/price → track + daily recheck
- On track: `/api/discover` scrapes regional Amazon + eBay + official PDPs; registers offers for the daily scheduler
- Wishlist with notify toggle and remove
- Product detail: tracked sources, dismiss/restore wrong matches
- User-triggered “Check live price” via `/api/price-check`
- Daily scheduler: `npm run price-check:daily` or `GET /api/scheduler/run`
- In-app notifications feed (localStorage) + PWA shell

## Shared catalog (SQLite via sql.js)

Successful scrapes land in **`.data/pricekeep.sqlite`**. Driver: **`sql.js`** (WASM -- no native C++ addon). Legacy `.data/shared-catalog.json` is migrated once on startup. An old better-sqlite3 WAL file that fails to open is backed up and the catalog is recreated. Catalog rows are keyed by **region**; TTL reuse is per-region. UI badges show **From catalog** vs **Fresh scrape**. If the catalog cannot open, search still attempts a live scrape and shows a warning.

## Scrape policy (important)

Live HTML fetches are **user-initiated** (search, track/discover, manual price check) plus the **optional daily scheduler** for already-tracked offers. There is **no mock/stub fallback data**. Shared catalog reuse avoids repeat scrapes. Requests use a polite User-Agent, AU/US Accept-Language + consent cookies for Google, short timeouts, per-host rate limits, and a short in-memory cache.

**Google Shopping reliability:** Plain HTTP often gets an `enablejs` shell. Pricekeep then launches **headless Chromium (Playwright)** on that path only. Home PCs with `npx playwright install chromium` (or `update.bat`) usually get real cards; cloud/datacenter IPs may still see captcha. Prefer scrape over any paid search API.

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
# SERPAPI_API_KEY=          # optional only; HTML scrape is preferred / default
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
AMAZON_ACCESS_KEY=
AMAZON_SECRET_KEY=
AMAZON_PARTNER_TAG=
SCHEDULER_SECRET=          # optional guard for /api/scheduler/run
PRICE_CHECK_CRON=0 6 * * * # for npm run scheduler
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · cheerio · **sql.js** · node-cron (dev scheduler) · localStorage

## Migration note

App source lives on GitHub at [s3xyberries/Wishlist](https://github.com/s3xyberries/Wishlist) (`main`).
