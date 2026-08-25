import { beforeEach, expect, test } from "vitest";

import {
  DEFAULT_CHART_TIMEFRAME_PREFERENCES,
  chartTimeframeStorageKey,
  compareTimeframes,
  loadChartTimeframePreferences,
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
  };

  persistChartTimeframePreferences("primary", preferences);
  expect(localStorage.getItem(chartTimeframeStorageKey("primary"))).toContain('"version":1');
  expect(loadChartTimeframePreferences("primary")).toEqual(preferences);
  expect(loadChartTimeframePreferences("secondary")).toEqual(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
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
