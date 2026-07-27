import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import type { components } from "../../api/generated";
import { fetchCandleWindow } from "./api";
import { candleWindowQueryKey } from "./queryKeys";

type CandleWindow = components["schemas"]["CandleWindow"];

const MAX_WINDOW_PAGES = 3;
const WINDOW_LIMIT = 200;
const CACHE_TIME_MS = 5 * 60 * 1000;

interface CandleWindowParams {
  enabled?: boolean;
  symbol: string;
  timeframe: string;
  limit?: number;
}

export function useCandleWindow({ enabled = true, symbol, timeframe, limit = WINDOW_LIMIT }: CandleWindowParams) {
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
    getNextPageParam: (lastPage) => (lastPage.has_more ? lastPage.next_cursor : undefined),
    maxPages: MAX_WINDOW_PAGES,
    retry: 0,
    enabled,
    staleTime: CACHE_TIME_MS,
    gcTime: CACHE_TIME_MS,
  });
}

export const candleWindowPolicy = {
  maxPages: MAX_WINDOW_PAGES,
  limit: WINDOW_LIMIT,
  cacheTimeMs: CACHE_TIME_MS,
} as const;
