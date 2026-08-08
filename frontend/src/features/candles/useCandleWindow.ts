import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import type { components } from "../../api/generated";
import { fetchCandleWindow } from "./api";
import { candleWindowQueryKey } from "./queryKeys";

type CandleWindow = components["schemas"]["CandleWindow"];

export const CANDLE_PAGE_SIZE = 1000;
export const MAX_RETAINED_CANDLES = 20_000;
const CACHE_TIME_MS = 5 * 60 * 1000;

interface CandleWindowParams {
  enabled?: boolean;
  symbol: string;
  timeframe: string;
  limit?: number;
}

export function useCandleWindow({ enabled = true, symbol, timeframe, limit = CANDLE_PAGE_SIZE }: CandleWindowParams) {
  return useInfiniteQuery<
    CandleWindow,
    Error,
    InfiniteData<CandleWindow>,
    ReturnType<typeof candleWindowQueryKey>,
    string | null
  >({
    queryKey: candleWindowQueryKey({ symbol, timeframe, cursor: null, limit }),
    queryFn: ({ pageParam, signal }) =>
      fetchCandleWindow({ symbol, timeframe, cursor: pageParam, limit, signal }),
    initialPageParam: null,
    getNextPageParam: (lastPage, allPages, lastPageParam, allPageParams) => {
      const loadedCandleCount = allPages.reduce((total, page) => total + page.candles.length, 0);
      if (
        loadedCandleCount + limit > MAX_RETAINED_CANDLES ||
        !lastPage.has_more ||
        !lastPage.next_cursor ||
        lastPage.next_cursor === lastPageParam ||
        allPageParams.includes(lastPage.next_cursor)
      ) {
        return undefined;
      }

      return lastPage.next_cursor;
    },
    retry: 0,
    enabled,
    staleTime: CACHE_TIME_MS,
    gcTime: CACHE_TIME_MS,
  });
}

export const candleWindowPolicy = {
  limit: CANDLE_PAGE_SIZE,
  maxRetainedCandles: MAX_RETAINED_CANDLES,
  cacheTimeMs: CACHE_TIME_MS,
} as const;
