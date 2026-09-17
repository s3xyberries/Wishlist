/**
 * Long-running local/dev scheduler: runs the daily price check once a day.
 * Usage: npm run scheduler
 *
 * Also fires once shortly after start (30s) so local testing is easy.
 * For production, prefer system cron / GitHub Actions hitting GET /api/scheduler/run.
 */
import cron from "node-cron";
import { runDailyPriceCheck } from "../src/lib/scheduler/price-check";

const CRON = process.env.PRICE_CHECK_CRON || "0 6 * * *"; // 06:00 local every day

async function tick(label: string) {
  console.log(`[scheduler] ${label} @ ${new Date().toISOString()}`);
  try {
    const result = await runDailyPriceCheck();
    console.log(
      `[scheduler] checked=${result.checked} updated=${result.updated} failed=${result.failed} alerts=${result.alerts}`,
    );
  } catch (err) {
    console.error("[scheduler] run failed", err);
  }
}

console.log(`[scheduler] cron="${CRON}" (set PRICE_CHECK_CRON to override)`);
cron.schedule(CRON, () => {
  void tick("daily");
});

const bootDelayMs = Number(process.env.SCHEDULER_BOOT_DELAY_MS ?? 30_000);
setTimeout(() => {
  void tick("boot");
}, bootDelayMs);
