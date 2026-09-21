/**
 * Preflight before next start -- fails fast with a clear message.
 */
const { existsSync, readFileSync } = require("node:fs");
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

if (!existsSync(path.join(root, "node_modules", "sql.js", "package.json"))) {
  fail("sql.js is not installed. Run: npm install");
}

const wasmPath = path.join(
  root,
  "node_modules",
  "sql.js",
  "dist",
  "sql-wasm.wasm",
);
if (!existsSync(wasmPath)) {
  fail(`sql.js WASM missing at ${wasmPath}. Re-run npm install.`);
}

try {
  // Smoke: can we read the WASM bytes? (no native addon)
  const n = readFileSync(wasmPath).byteLength;
  if (n < 1000) fail("sql-wasm.wasm looks corrupt (too small)");
  console.log("[Pricekeep preflight] sql.js WASM OK (", n, "bytes)");
} catch (err) {
  fail(`Could not read sql.js WASM: ${err && err.message ? err.message : err}`);
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
  console.log("[Pricekeep preflight] OK -- starting server...");
})();
