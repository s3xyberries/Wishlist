import { NextResponse } from "next/server";
import {
  catalogAvailabilityNote,
  catalogDbPath,
  isCatalogAvailable,
  MIN_NODE_VERSION,
} from "@/lib/catalog/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Local diagnostics: Node version + whether the SQLite catalog opened. */
export async function GET() {
  const catalogOk = isCatalogAvailable();
  return NextResponse.json({
    ok: true,
    node: process.versions.node,
    minNodeRecommended: MIN_NODE_VERSION,
    catalog: {
      available: catalogOk,
      driver: "better-sqlite3",
      path: catalogDbPath(),
      note: catalogAvailabilityNote(),
    },
    builtinNodeSqlite: false,
  });
}
