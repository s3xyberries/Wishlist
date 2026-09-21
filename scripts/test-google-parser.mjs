/**
 * Offline parser smoke test for Google Shopping HTML fixtures.
 * Run: node scripts/test-google-parser.mjs
 */
import * as cheerio from "cheerio";

function parseMoney(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized =
      cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (cleaned.includes(",")) {
    const parts = cleaned.split(",");
    normalized =
      parts[parts.length - 1].length === 2
        ? `${parts.slice(0, -1).join("")}.${parts[parts.length - 1]}`
        : cleaned.replace(/,/g, "");
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function classify(html) {
  const lower = html.toLowerCase();
  if (lower.includes("/sorry/") || lower.includes("unusual traffic")) return "captcha";
  if (lower.includes("enablejs") || lower.includes("/httpservice/retry/enablejs"))
    return "js_required";
  if (lower.includes("nothing to see here")) return "unavailable";
  const hasProductMarkers =
    lower.includes("a8pemb") ||
    lower.includes("sh-dgr") ||
    lower.includes("data-docid") ||
    lower.includes("/shopping/product/");
  if (html.length < 2500 && !hasProductMarkers) return "blocked";
  return "ok";
}

function parseDom(html) {
  const $ = cheerio.load(html);
  const out = [];
  $("div.sh-dgr__grid-result, div[data-docid]").each((_, el) => {
    const root = $(el);
    const title = root.find("h3, h4").first().text().trim();
    const price = parseMoney(
      root.find("span.a8Pemb").first().text() || root.text().match(/\$[\d,.]+/)?.[0],
    );
    const href = root.find("a[href]").first().attr("href");
    if (title && price) out.push({ title, price, href });
  });
  return out;
}

const goodHtml = `
<html><body>
  <div class="sh-dgr__grid-result" data-docid="1">
    <h3>Bambu Lab H2S 3D Printer</h3>
    <span class="a8Pemb">$2,199.00</span>
    <div class="aULzUe">Amazon.com.au</div>
    <a href="https://www.google.com.au/shopping/product/123">View</a>
    <img src="https://example.com/h2s.jpg" />
  </div>
  <div class="sh-dgr__grid-result" data-docid="2">
    <h3>Bambu Lab H2S Combo</h3>
    <span class="a8Pemb">A$2,499.00</span>
    <a href="/shopping/product/456">View</a>
  </div>
</body></html>`;

const jsShell = `<html><body><noscript>enablejs</noscript><a href="/httpservice/retry/enablejs?sei=x">here</a></body></html>`;

const cards = parseDom(goodHtml);
const statusGood = classify(goodHtml);
const statusJs = classify(jsShell);

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed += 1;
  } else {
    console.log("ok:", msg);
  }
}

assert(statusGood === "ok", `good fixture classified ok (got ${statusGood})`);
assert(statusJs === "js_required", `js shell classified js_required (got ${statusJs})`);
assert(cards.length === 2, `parsed 2 cards (got ${cards.length})`);
assert(cards[0]?.title.includes("H2S"), `first title has H2S`);
assert(cards[0]?.price === 2199, `first price 2199 (got ${cards[0]?.price})`);
assert(cards[1]?.price === 2499, `second price 2499 (got ${cards[1]?.price})`);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll google parser smoke checks passed.");
