<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Pricekeep is a single Next.js app. There is no separate database service: the shared catalog is sql.js (WASM SQLite) at `.data/pricekeep.sqlite`, created on first use.

- Install: `npm ci`, then `npx playwright install --with-deps chromium`. `postinstall` also downloads Chromium and soft-fails if that download fails, so the explicit Playwright command is the one that must succeed. All keys in `.env.example` are optional; do not block on them.
- Dev server: `npm run dev` listens on `http://127.0.0.1:43127` (not port 3000). Production path is `npm run build && npm start` on the same host and port.
- Checks: `npm run lint`, `npx tsc --noEmit`. There is no automated test script.
- Health: `GET /api/health` should report `ok: true` and `catalog.driver: "sql.js"`. Liveness: `GET /api/ping`.
- Core UI flow: search on `/`, confirm a result, then open `/wishlist`. Pasting a product URL on `/wishlist` tracks it without search. Wishlist rows live in `localStorage`.
- Google Shopping often returns a captcha from datacenter IPs. Search still falls through to Amazon and official product pages, and catalog hits are reused for six hours.
