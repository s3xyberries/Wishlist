import { NextResponse } from "next/server";
import { runDailyPriceCheck } from "@/lib/scheduler/price-check";
import { regionFromRequest } from "@/lib/region/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Manual / cron trigger for the daily price recheck.
 * GET /api/scheduler/run?region=au (optional region filter)
 * Protect with SCHEDULER_SECRET header in production if set.
 */
export async function GET(request: Request) {
  const secret = process.env.SCHEDULER_SECRET;
  if (secret) {
    const provided =
      request.headers.get("x-scheduler-secret") ||
      new URL(request.url).searchParams.get("secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { searchParams } = new URL(request.url);
  const regionParam = searchParams.get("region");
  const region =
    regionParam === "all"
      ? undefined
      : regionParam
        ? regionParam
        : (await regionFromRequest(request)).id;

  const result = await runDailyPriceCheck({
    region: region === "au" || region === "us" ? region : undefined,
  });

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    ...result,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
