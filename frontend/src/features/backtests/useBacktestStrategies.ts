import { useQuery } from "@tanstack/react-query";

import { fetchStrategyDefinitions } from "./api";

const STRATEGY_CATALOG_CACHE_TIME_MS = 5 * 60 * 1000;

export function useBacktestStrategies() {
  return useQuery({
    queryKey: ["backtest-strategies"],
    queryFn: ({ signal }) => fetchStrategyDefinitions(signal),
    retry: 0,
    staleTime: STRATEGY_CATALOG_CACHE_TIME_MS,
    gcTime: STRATEGY_CATALOG_CACHE_TIME_MS,
  });
}

export const backtestStrategyPolicy = {
  cacheTimeMs: STRATEGY_CATALOG_CACHE_TIME_MS,
  retry: 0,
} as const;
