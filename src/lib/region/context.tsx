"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_REGION_ID,
  REGION_COOKIE,
  REGION_STORAGE_KEY,
  REGIONS,
  getRegion,
  isRegionId,
  type RegionConfig,
  type RegionId,
} from "./config";

interface RegionContextValue {
  region: RegionConfig;
  regionId: RegionId;
  setRegionId: (id: RegionId) => void;
  ready: boolean;
}

const RegionContext = createContext<RegionContextValue | null>(null);

function writeCookie(id: RegionId) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${REGION_COOKIE}=${id}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function RegionProvider({ children }: { children: ReactNode }) {
  const [regionId, setRegionIdState] = useState<RegionId>(DEFAULT_REGION_ID);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(REGION_STORAGE_KEY);
        if (isRegionId(stored)) {
          setRegionIdState(stored);
          writeCookie(stored);
        } else {
          writeCookie(DEFAULT_REGION_ID);
        }
      } catch {
        writeCookie(DEFAULT_REGION_ID);
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const setRegionId = useCallback((id: RegionId) => {
    setRegionIdState(id);
    try {
      localStorage.setItem(REGION_STORAGE_KEY, id);
    } catch {
      // private mode
    }
    writeCookie(id);
  }, []);

  const value = useMemo(
    () => ({
      region: getRegion(regionId),
      regionId,
      setRegionId,
      ready,
    }),
    [regionId, setRegionId, ready],
  );

  return (
    <RegionContext.Provider value={value}>{children}</RegionContext.Provider>
  );
}

export function useRegion() {
  const ctx = useContext(RegionContext);
  if (!ctx) throw new Error("useRegion must be used within RegionProvider");
  return ctx;
}

export function regionQueryParam(id: RegionId = REGIONS[DEFAULT_REGION_ID].id) {
  return `region=${id}`;
}
