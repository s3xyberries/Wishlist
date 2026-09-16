# Pricekeep

Wishlist and price-tracking web app (PWA-ready). Search products, confirm the right match, track Amazon/eBay/generic sources, review price history, and see an in-app alerts stub.

This first slice runs entirely on **mock data** — no API keys required.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43127](http://127.0.0.1:43127).

`npm run dev` uses **webpack** (not Turbopack) on purpose — in some VM/proxy environments Turbopack’s HMR WebSocket fails and client hydration never finishes (search/wishlist stay broken). Prefer:

```bash
npm run build && npm start   # production mode on the same port (most reliable)
npm run lint
```

## What works now

- Product search against a local mock Google Shopping–style catalog
- Confirm / intercept step before adding to the wishlist
- Wishlist with notify toggle and remove
- Product detail: tracked sources (Amazon + eBay stubs + generic URL), dismiss/restore wrong matches
- Seeded price history chart + mock “price check” that can emit a drop alert
- In-app notifications feed (localStorage)
- PWA manifest + basic service worker shell

## What is mocked

| Piece | Status |
|-------|--------|
| Google Shopping | Mock catalog via `/api/search` |
| Amazon / eBay offers | Stub adapters (no scraping) |
| Price polls | Client-side mock check |
| Push / email alerts | Stub UI only |

Wishlist state persists in `localStorage` (`pricekeep-state-v1`).

## Optional env (later)

Copy `.env.example`. Keys are recognized but live providers are not wired yet — the app still falls back to mocks.

```bash
# .env.local
GOOGLE_SHOPPING_API_KEY=
SERPAPI_API_KEY=
NEXT_PUBLIC_GOOGLE_SHOPPING_API_KEY=
```

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · localStorage

## Product plan

See the Project docs (agent store) for MVP scope, data model, adapter design, risks, and roadmap — not checked into this git repo.
