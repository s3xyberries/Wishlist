import { cookies } from "next/headers";
import {
  DEFAULT_REGION_ID,
  REGION_COOKIE,
  getRegion,
  isRegionId,
  type RegionConfig,
  type RegionId,
} from "./config";

/** Resolve region from query/header/cookie (AU default). */
export function regionFromSearchParams(
  searchParams: URLSearchParams,
): RegionConfig {
  const fromQuery = searchParams.get("region");
  if (isRegionId(fromQuery)) return getRegion(fromQuery);
  return getRegion(DEFAULT_REGION_ID);
}

export async function regionFromRequest(request: Request): Promise<RegionConfig> {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("region");
  if (isRegionId(fromQuery)) return getRegion(fromQuery);

  const header = request.headers.get("x-pricekeep-region");
  if (isRegionId(header)) return getRegion(header);

  try {
    const jar = await cookies();
    const c = jar.get(REGION_COOKIE)?.value;
    if (isRegionId(c)) return getRegion(c);
  } catch {
    // cookies() unavailable outside request scope
  }

  return getRegion(DEFAULT_REGION_ID);
}

export function parseRegionId(raw: unknown): RegionId {
  return isRegionId(raw) ? raw : DEFAULT_REGION_ID;
}
