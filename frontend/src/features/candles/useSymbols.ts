import { useQuery } from "@tanstack/react-query";

import { fetchSymbols } from "./api";
import { symbolCatalogQueryKey } from "./queryKeys";

const CATALOG_CACHE_TIME_MS = 5 * 60 * 1000;

export function useSymbols() {
  return useQuery({
    queryKey: symbolCatalogQueryKey,
    queryFn: ({ signal }) => fetchSymbols({ signal }),
    retry: 0,
    staleTime: CATALOG_CACHE_TIME_MS,
    gcTime: CATALOG_CACHE_TIME_MS,
  });
}

export const symbolCatalogPolicy = {
  cacheTimeMs: CATALOG_CACHE_TIME_MS,
  retry: 0,
} as const;
