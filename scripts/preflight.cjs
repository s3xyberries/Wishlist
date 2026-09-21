/**
 * Preflight before next start — fails fast with a clear message instead of a silent crash.
 */
const { existsSync } = require("node:fs");
const { createServer } = require("node:net");
const path = require("node:path");

const root = process.cwd();
const port = Number(process.env.PORT || 43127);
const host = process.env.HOST || "127.0.0.1";

function fail(msg) {
  console.error("\n[Pricekeep preflight] FAILED:", msg, "\n");
  process.exit(1);
}

if (!existsSync(path.join(root, "package.json"))) {
  fail(`package.json not found in ${root}`);
}

if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  fail("Missing .next/BUILD_ID. Run: npm run build");
}

if (!existsSync(path.join(root, "node_modules", "better-sqlite3", "package.json"))) {
  fail("better-sqlite3 is not installed. Run: npm install");
}

try {
  // Native load — if this throws/aborts, Windows ABI or build tools are wrong.
  require("better-sqlite3");
  console.log("[Pricekeep preflight] better-sqlite3 OK");
} catch (err) {
  fail(
    `better-sqlite3 failed to load: ${err && err.message ? err.message : err}. Run npm install; on Windows install VS Build Tools (Desktop C++).`,
  );
}

function canListen(h, p) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once("error", (e) => {
      resolve({ ok: false, error: e });
    });
    srv.once("listening", () => {
      srv.close(() => resolve({ ok: true }));
    });
    srv.listen(p, h);
  });
}

(async () => {
  const listen = await canListen(host, port);
  if (!listen.ok) {
    fail(
      `Port ${host}:${port} is not available (${listen.error && listen.error.code ? listen.error.code : listen.error}). Close the other Pricekeep/run.bat window or free the port.`,
    );
  }
  console.log(`[Pricekeep preflight] Port ${host}:${port} free`);
  console.log("[Pricekeep preflight] OK — starting server…");
})();
