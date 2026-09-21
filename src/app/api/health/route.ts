import { NextResponse } from "next/server";
import {
  catalogAvailabilityNote,
  catalogDbPath,
  CATALOG_DRIVER,
  isCatalogAvailable,
  MIN_NODE_VERSION,
} from "@/lib/catalog/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Local diagnostics: Node version + whether the SQLite catalog opened. */
export async function GET() {
  const catalogOk = await isCatalogAvailable();
  return NextResponse.json({
    ok: true,
    node: process.versions.node,
    minNodeRecommended: MIN_NODE_VERSION,
    catalog: {
      available: catalogOk,
      driver: CATALOG_DRIVER,
      path: catalogDbPath(),
      note: await catalogAvailabilityNote(),
    },
    /** Confirmed: no native node:sqlite / better-sqlite3 in this build. */
    builtinNodeSqlite: false,
    nativeBetterSqlite3: false,
  });
}
