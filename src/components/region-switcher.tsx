"use client";

import { REGION_LIST, type RegionId } from "@/lib/region/config";
import { useRegion } from "@/lib/region/context";
import { cn } from "@/lib/utils";

export function RegionSwitcher() {
  const { regionId, setRegionId, ready } = useRegion();

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-background/70 p-0.5"
      role="group"
      aria-label="Region"
    >
      {REGION_LIST.map((r) => {
        const active = ready ? regionId === r.id : r.id === "au";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => setRegionId(r.id as RegionId)}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-teal-800 text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            aria-pressed={active}
            title={`${r.label} · ${r.currency}`}
          >
            {r.shortLabel}
            <span className="ml-1 opacity-70">{r.currency}</span>
          </button>
        );
      })}
    </div>
  );
}
