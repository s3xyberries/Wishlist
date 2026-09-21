/**
 * Ensure Playwright Chromium is available for Google Shopping browser fallback.
 * Soft-fails so npm install still succeeds offline; update.bat prints the same step.
 */
const { execSync } = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

if (process.env.PRICEKEEP_SKIP_PLAYWRIGHT === "1") {
  console.log("[Pricekeep] Skipping Playwright Chromium install (PRICEKEEP_SKIP_PLAYWRIGHT=1).");
  process.exit(0);
}

try {
  require.resolve("playwright");
} catch {
  console.warn(
    "[Pricekeep] playwright package not installed yet — skip Chromium download.",
  );
  process.exit(0);
}

console.log("[Pricekeep] Ensuring Playwright Chromium for Google Shopping fallback...");
try {
  execSync("npx --yes playwright install chromium", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      // Avoid interactive prompts on Windows.
      PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH || undefined,
    },
    shell: true,
  });
  console.log("[Pricekeep] Playwright Chromium OK.");
} catch (err) {
  console.warn(
    "[Pricekeep] Playwright Chromium install failed or was skipped.",
  );
  console.warn(
    "  Google Shopping headless fallback needs: npx playwright install chromium",
  );
  console.warn(
    "  Or double-click update.bat after Node/Git are on PATH.",
  );
  if (err && err.message) console.warn(" ", err.message);
  // Non-fatal: HTTP scrape + Amazon/official still work.
  process.exit(0);
}
