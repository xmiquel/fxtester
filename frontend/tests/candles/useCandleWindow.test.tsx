import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";

import { useCandleWindow } from "../../src/features/candles/useCandleWindow";
import { candleWindowQueryKey } from "../../src/features/candles/queryKeys";
import { server } from "../mocks/server";

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

test.each([
  { description: "has_more is false", hasMore: false, nextCursor: "next" },
  { description: "next_cursor is null", hasMore: true, nextCursor: null },
  { description: "next_cursor is empty", hasMore: true, nextCursor: "" },
])("stops pagination when $description", async ({ hasMore, nextCursor }) => {
  let requests = 0;
  server.use(
    http.get("*/api/candles", () => {
      requests += 1;
      return HttpResponse.json({ candles: [], has_more: hasMore, next_cursor: nextCursor, symbol: "NDX", timeframe: "1m" });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useCandleWindow({ symbol: "NDX", timeframe: "1m" }), {
    wrapper: createWrapper(queryClient),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.hasNextPage).toBe(false);
  expect(requests).toBe(1);
});

test("stops pagination when the next cursor repeats the last page parameter", async () => {
  let requests = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      requests += 1;
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json({
        candles: [],
        has_more: true,
        next_cursor: cursor === null ? "repeated" : "repeated",
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { result } = renderHook(() => useCandleWindow({ symbol: "NDX", timeframe: "1m" }), {
    wrapper: createWrapper(queryClient),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.hasNextPage).toBe(true);
  await act(async () => {
    await result.current.fetchNextPage();
  });
  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));

  expect(result.current.hasNextPage).toBe(false);
  expect(requests).toBe(2);
});

test("stops pagination when the next cursor repeats any accumulated page parameter", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const queryKey = candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: null, limit: 1000 });
  const page = (nextCursor: string) => ({
    candles: [],
    has_more: true,
    next_cursor: nextCursor,
    symbol: "NDX",
    timeframe: "1m",
  });
  queryClient.setQueryData(queryKey, {
    pages: [page("cursor-a"), page("cursor-b"), page("cursor-a")],
    pageParams: [null, "cursor-a", "cursor-b"],
  });
  const { result } = renderHook(() => useCandleWindow({ symbol: "NDX", timeframe: "1m" }), {
    wrapper: createWrapper(queryClient),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.hasNextPage).toBe(false);
  expect(result.current.data?.pageParams).toEqual([null, "cursor-a", "cursor-b"]);
});
