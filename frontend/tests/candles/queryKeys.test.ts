import { expect, test } from "vitest";

import { candleWindowQueryKey } from "../../src/features/candles/queryKeys";
import { candleWindowPolicy } from "../../src/features/candles/useCandleWindow";

test("market window keys include symbol, timeframe, cursor, and limit without chart identity", () => {
  expect(candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: "2025-01-01T00:00:00", limit: 200 })).toEqual([
    "candles",
    "NDX",
    "1m",
    "2025-01-01T00:00:00",
    200,
  ]);
});

test("window retention stays bounded", () => {
  expect(candleWindowPolicy.maxPages).toBe(3);
  expect(candleWindowPolicy.limit).toBe(200);
});
