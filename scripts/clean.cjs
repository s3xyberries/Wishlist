/**
 * Safe local cleanup — delete generated folders (not source).
 * Usage: node scripts/clean.cjs [--all]
 *   default: .next + node_modules/.cache
 *   --all:   also removes node_modules (then run npm install)
 */
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const all = process.argv.includes("--all");

function rm(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.log(`skip (missing): ${rel}`);
    return;
  }
  fs.rmSync(full, { recursive: true, force: true });
  console.log(`removed: ${rel}`);
}

console.log("Pricekeep clean — safe local deletes only (.next / caches).");
rm(".next");
rm(path.join("node_modules", ".cache"));

if (all) {
  console.log("\n--all: removing node_modules (re-run npm install after).");
  rm("node_modules");
}

console.log(
  "\nOptional: delete .data/ to reset the local SQLite catalog (wishlist in the browser is separate).",
);
console.log("Done. Next: npm install (if --all) → npm run build → npm start  or  run.bat");
