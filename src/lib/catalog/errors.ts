export class CatalogUnavailableError extends Error {
  code = "CATALOG_UNAVAILABLE" as const;
  constructor(message: string) {
    super(message);
    this.name = "CatalogUnavailableError";
  }
}
