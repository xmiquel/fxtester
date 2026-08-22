import { useQuery } from "@tanstack/react-query";

import { fetchTimeframes } from "./api";

const TIMEFRAME = {
  FIFTEEN_MINUTES: "15m",
  FIVE_MINUTES: "5m",
  ONE_HOUR: "1h",
  ONE_MINUTE: "1m",
  TWO_MINUTES: "2m",
} as const;

export const TIMEFRAME_UNIT = {
  HOURS: "h",
  MINUTES: "m",
} as const;

export type TimeframeUnit = (typeof TIMEFRAME_UNIT)[keyof typeof TIMEFRAME_UNIT];
export type Timeframe = `${number}${TimeframeUnit}`;

const TIMEFRAMES_CACHE_TIME_MS = 5 * 60 * 1000;
const FALLBACK_TIMEFRAMES: Timeframe[] = [
  TIMEFRAME.ONE_MINUTE,
  TIMEFRAME.TWO_MINUTES,
  TIMEFRAME.FIVE_MINUTES,
  TIMEFRAME.FIFTEEN_MINUTES,
  TIMEFRAME.ONE_HOUR,
];

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
