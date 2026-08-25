import { useQuery } from "@tanstack/react-query";

import { fetchTimeframes } from "./api";

const TIMEFRAME = {
  FOUR_HOURS: "4h",
  FIFTEEN_MINUTES: "15m",
  FIVE_MINUTES: "5m",
  THREE_HOURS: "3h",
  THREE_MINUTES: "3m",
  ONE_HOUR: "1h",
  ONE_DAY: "1d",
  ONE_MINUTE: "1m",
} as const;

export const TIMEFRAME_UNIT = {
  CALENDAR_MONTHS: "M",
  DAYS: "d",
  HOURS: "h",
  MINUTES: "m",
  WEEKS: "w",
} as const;

export type TimeframeUnit = (typeof TIMEFRAME_UNIT)[keyof typeof TIMEFRAME_UNIT];
export type Timeframe = `${number}${TimeframeUnit}`;

const TIMEFRAMES_CACHE_TIME_MS = 5 * 60 * 1000;
const FALLBACK_TIMEFRAMES: Timeframe[] = [
  TIMEFRAME.ONE_MINUTE,
  TIMEFRAME.THREE_MINUTES,
  TIMEFRAME.FIVE_MINUTES,
  TIMEFRAME.FIFTEEN_MINUTES,
  TIMEFRAME.ONE_HOUR,
  TIMEFRAME.THREE_HOURS,
  TIMEFRAME.FOUR_HOURS,
  TIMEFRAME.ONE_DAY,
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
