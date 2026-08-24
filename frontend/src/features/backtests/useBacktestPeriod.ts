import { useQuery } from "@tanstack/react-query";

import { fetchBacktestPeriod } from "./api";

const BACKTEST_PERIOD_CACHE_TIME_MS = 5 * 60 * 1000;

export function useBacktestPeriod(symbol: string, timeframe: string) {
  return useQuery({
    queryKey: ["backtest-period", symbol, timeframe],
    queryFn: ({ signal }) => fetchBacktestPeriod(symbol, timeframe, signal),
    retry: 0,
    staleTime: BACKTEST_PERIOD_CACHE_TIME_MS,
    gcTime: BACKTEST_PERIOD_CACHE_TIME_MS,
  });
}
