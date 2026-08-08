import { expect, test } from "vitest";

import { candleWindowQueryKey, symbolCatalogQueryKey } from "../../src/features/candles/queryKeys";
import { candleWindowPolicy } from "../../src/features/candles/useCandleWindow";

test("market window keys include symbol, timeframe, cursor, and limit without chart identity", () => {
  expect(candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: "2025-01-01T00:00:00", limit: 1000 })).toEqual([
    "candles",
    "NDX",
    "1m",
    "2025-01-01T00:00:00",
    1000,
  ]);
});

test("window policy retains pages up to the explicit candle cap", () => {
  expect(candleWindowPolicy).not.toHaveProperty("maxPages");
  expect(candleWindowPolicy.limit).toBe(1000);
  expect(candleWindowPolicy.maxRetainedCandles).toBe(20_000);
});

test("symbol catalog uses a stable shared query key", () => {
  expect(symbolCatalogQueryKey).toEqual(["symbols"]);
});
