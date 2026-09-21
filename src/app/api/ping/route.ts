import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tiny liveness probe — distinguishes "server down" from SW/CORS fetch failures. */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      ping: true,
      t: Date.now(),
      node: process.versions.node,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
}
