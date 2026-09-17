import { Suspense } from "react";
import { SearchExperience } from "@/components/search-experience";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-muted-foreground animate-pulse">
          Loading search…
        </p>
      }
    >
      <SearchExperience />
    </Suspense>
  );
}
