import type { Metadata } from "next";
import { CatalogView } from "@/components/catalog-view";

export const metadata: Metadata = {
  title: "Shared catalog",
};

export default function CatalogPage() {
  return <CatalogView />;
}
