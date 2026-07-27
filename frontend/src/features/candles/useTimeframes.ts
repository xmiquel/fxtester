import { useQuery } from "@tanstack/react-query";

import { fetchTimeframes } from "./api";

const TIMEFRAMES_CACHE_TIME_MS = 5 * 60 * 1000;
const FALLBACK_TIMEFRAMES = ["1m", "5m", "15m", "1h"];

export function useTimeframes() {
  return useQuery<string[], Error>({
    queryKey: ["timeframes"],
    queryFn: ({ signal }) => fetchTimeframes(signal),
    retry: 0,
    staleTime: TIMEFRAMES_CACHE_TIME_MS,
    gcTime: TIMEFRAMES_CACHE_TIME_MS,
    placeholderData: FALLBACK_TIMEFRAMES,
  });
}

export const timeframePolicy = {
  cacheTimeMs: TIMEFRAMES_CACHE_TIME_MS,
  fallback: FALLBACK_TIMEFRAMES,
} as const;
