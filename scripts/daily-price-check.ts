/**
 * One-shot daily price recheck for tracked offers in SQLite.
 * Usage: npm run price-check:daily
 * Optional: REGION=au npm run price-check:daily
 */
import { runDailyPriceCheck } from "../src/lib/scheduler/price-check";

async function main() {
  const region = process.env.REGION;
  console.log(
    `[price-check] starting${region ? ` (region=${region})` : " (all regions)"}…`,
  );
  const result = await runDailyPriceCheck({
    region: region === "au" || region === "us" ? region : undefined,
  });
  console.log(
    `[price-check] checked=${result.checked} updated=${result.updated} failed=${result.failed} alerts=${result.alerts}`,
  );
  for (const d of result.details) {
    console.log(
      `  - ${d.title}: ${d.ok ? `${d.previous} → ${d.next}` : "FAIL"} (${d.note})`,
    );
  }
}

main().catch((err) => {
  console.error("[price-check] fatal", err);
  process.exit(1);
});
