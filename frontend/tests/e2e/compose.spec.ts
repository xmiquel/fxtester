import { expect, test } from "@playwright/test";

interface Candle {
  OPEN: number;
  close: number;
  datetime: string;
  high: number;
  low: number;
}

interface CandleWindow {
  candles: Candle[];
  has_more: boolean;
  symbol: string;
  timeframe: string;
}

interface SymbolCatalog {
  symbols: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCandleWindow(value: unknown, expectedSymbol: string): value is CandleWindow {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const window = value as Partial<CandleWindow>;
  return (
    window.symbol === expectedSymbol &&
    window.timeframe === "1m" &&
    typeof window.has_more === "boolean" &&
    Array.isArray(window.candles) &&
    window.candles.length > 0 &&
    window.candles.every(
      (candle) =>
        typeof candle.datetime === "string" &&
        Number.isFinite(Date.parse(candle.datetime)) &&
        isFiniteNumber(candle.OPEN) &&
        isFiniteNumber(candle.high) &&
        isFiniteNumber(candle.low) &&
        isFiniteNumber(candle.close),
    )
  );
}

test("Compose serves an executed React chart with a selected catalog symbol", async ({ page }) => {
  const catalogResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/symbols" && response.status() === 200,
  );
  const candleResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/candles" && response.status() === 200,
  );
  await page.goto("/");
  const catalog: unknown = await (await catalogResponse).json();
  expect(catalog).toEqual(expect.objectContaining({ symbols: expect.any(Array) }));
  const selectedSymbol = (catalog as SymbolCatalog).symbols[0];
  expect(selectedSymbol).toEqual(expect.any(String));
  const candleWindow: unknown = await (await candleResponse).json();

  expect(isCandleWindow(candleWindow, selectedSymbol)).toBe(true);
  if (!isCandleWindow(candleWindow, selectedSymbol)) {
    return;
  }

  await expect(page.getByRole("heading", { name: "Trading Terminal" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Market symbol" })).toHaveValue(selectedSymbol);
  const chartHistory = page.getByTestId("chart-history");
  await expect(chartHistory).toHaveAttribute("data-candle-datetimes", /.+/);
  const renderedDatetimes = (await chartHistory.getAttribute("data-candle-datetimes"))?.split(",") ?? [];
  expect(renderedDatetimes).toEqual(expect.arrayContaining(candleWindow.candles.map((candle) => candle.datetime)));

  const loadOlder = page.getByRole("button", { name: "Load older candles" });
  if (candleWindow.has_more) {
    await expect(loadOlder).toBeEnabled();
  } else {
    await expect(loadOlder).toBeDisabled();
  }
});
