import { beforeEach, expect, test } from "vitest";

import {
  DEFAULT_CHART_TIMEFRAME_PREFERENCES,
  chartTimeframeStorageKey,
  compareTimeframes,
  loadChartTimeframePreferences,
  normalizeCatalogSymbols,
  parseTimeframe,
  persistChartTimeframePreferences,
  reconcileChartTimeframePreferences,
  type ChartTimeframePreferences,
} from "../../src/features/candles/chartTimeframePreferences";

beforeEach(() => {
  localStorage.clear();
});

test("seeds the eight required favorites in deterministic order", () => {
  expect(DEFAULT_CHART_TIMEFRAME_PREFERENCES).toEqual({
    available: ["1m", "3m", "5m", "15m", "1h", "3h", "4h", "1d"],
    favorites: ["1m", "3m", "5m", "15m", "1h", "3h", "4h", "1d"],
  });
});

test("orders case-sensitive units before their numeric period", () => {
  expect(["2M", "1w", "15m", "3h", "1d", "2m"].sort(compareTimeframes)).toEqual([
    "2m",
    "15m",
    "3h",
    "1d",
    "1w",
    "2M",
  ]);
});

test.each(["1m", "3h", "2d", "1w", "2M"])("accepts exact token %s", (token) => {
  expect(parseTimeframe(token)?.token).toBe(token);
});

test.each(["0m", "-1h", "1H", "1W", "1mm", "1.5h", "01m"])("rejects invalid token %s", (token) => {
  expect(parseTimeframe(token)).toBeNull();
});

test("reconciles duplicates, stale favorites, catalog values, and a custom value", () => {
  const preferences: ChartTimeframePreferences = {
    available: ["7m", "7m", "1H", "1d"],
    favorites: ["7m", "1H", "1d"],
  };

  expect(reconcileChartTimeframePreferences(preferences, ["1m", "1d", "1M"])).toEqual({
    available: ["1m", "7m", "1d", "1M"],
    favorites: ["7m", "1d"],
  });
});

test("persists and restores preferences by chart identity", () => {
  const preferences: ChartTimeframePreferences = {
    available: ["1m", "7m"],
    favorites: ["7m"],
    selectedSymbol: "AAPL",
  };

  persistChartTimeframePreferences("primary", preferences, ["AAPL", "MSFT"]);
  expect(localStorage.getItem(chartTimeframeStorageKey("primary"))).toContain('"version":2');
  expect(loadChartTimeframePreferences("primary", ["AAPL", "MSFT"])).toEqual(preferences);
  expect(loadChartTimeframePreferences("secondary")).toEqual(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
});

test("normalizes catalog symbols with deterministic folded deduplication", () => {
  expect(normalizeCatalogSymbols(["msft", "AAPL", "aapl", "MSFT", "BTCUSD"])).toEqual([
    { folded: "aapl", original: "AAPL" },
    { folded: "btcusd", original: "BTCUSD" },
    { folded: "msft", original: "MSFT" },
  ]);
});

test("reads v1 records and safely reconciles invalid v2 symbol values", () => {
  localStorage.setItem(
    chartTimeframeStorageKey("legacy"),
    JSON.stringify({ version: 1, available: ["1m", "1m", "bad"], favorites: ["1m", "stale"] }),
  );
  expect(loadChartTimeframePreferences("legacy")).toEqual({ available: ["1m"], favorites: ["1m"] });

  localStorage.setItem(
    chartTimeframeStorageKey("v2"),
    JSON.stringify({ version: 2, available: ["1m"], favorites: ["1m"], selectedSymbol: "missing" }),
  );
  expect(loadChartTimeframePreferences("v2", ["BTCUSD", "AAPL"])).toEqual({
    available: ["1m"],
    favorites: ["1m"],
    selectedSymbol: "AAPL",
  });
});

test("falls back to the first normalized catalog symbol and preserves chart isolation", () => {
  const preferences: ChartTimeframePreferences = {
    available: ["1m"],
    favorites: ["1m"],
    selectedSymbol: "stale",
  };
  expect(reconcileChartTimeframePreferences(preferences, [], ["zulu", "ALPHA", "alpha"])).toEqual({
    available: ["1m"],
    favorites: ["1m"],
    selectedSymbol: "ALPHA",
  });

  persistChartTimeframePreferences("chart-a", { ...preferences, selectedSymbol: "AAPL" }, ["AAPL", "MSFT"]);
  persistChartTimeframePreferences("chart-b", { ...preferences, selectedSymbol: "MSFT" }, ["AAPL", "MSFT"]);
  expect(loadChartTimeframePreferences("chart-a", ["AAPL", "MSFT"]).selectedSymbol).toBe("AAPL");
  expect(loadChartTimeframePreferences("chart-b", ["AAPL", "MSFT"]).selectedSymbol).toBe("MSFT");
});

test("recovers from malformed and unavailable browser storage", () => {
  localStorage.setItem(chartTimeframeStorageKey("primary"), "not-json");
  expect(loadChartTimeframePreferences("primary")).toEqual(DEFAULT_CHART_TIMEFRAME_PREFERENCES);

  const getItem = localStorage.getItem.bind(localStorage);
  localStorage.getItem = () => {
    throw new Error("storage unavailable");
  };
  expect(loadChartTimeframePreferences("primary")).toEqual(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
  localStorage.getItem = getItem;
});
