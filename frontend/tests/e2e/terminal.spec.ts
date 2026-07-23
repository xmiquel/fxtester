import { expect, test } from "@playwright/test";

const initialWindow = {
  symbol: "NDX",
  timeframe: "1m",
  candles: [
    {
      datetime: "2025-01-01T00:03:00",
      symbol: "NDX",
      OPEN: 100,
      high: 105,
      low: 99,
      close: 103,
      tickvol: 1,
      volume: 1,
      spread: 1,
      origen: "test",
      fecha_carga: "2025-01-01T00:03:00",
    },
  ],
  next_cursor: "2025-01-01T00:02:00",
  has_more: true,
};

const olderWindow = {
  ...initialWindow,
  candles: [
    {
      ...initialWindow.candles[0],
      datetime: "2025-01-01T00:01:00",
      fecha_carga: "2025-01-01T00:01:00",
    },
    {
      ...initialWindow.candles[0],
      datetime: "2025-01-01T00:02:00",
      fecha_carga: "2025-01-01T00:02:00",
    },
    initialWindow.candles[0],
  ],
  next_cursor: null,
  has_more: false,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/symbols", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ symbols: ["NDX", "SPX"] }) }),
  );
});

test("renders one bounded window and requests older history only after navigation", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/candles?**", async (route) => {
    requests.push(route.request().url());
    const isOlderWindow = new URL(route.request().url()).searchParams.has("cursor");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(isOlderWindow ? olderWindow : initialWindow),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trading Terminal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load older candles" })).toBeEnabled();
  await expect.poll(() => requests.length).toBe(1);

  await page.getByRole("button", { name: "Load older candles" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1]).searchParams.get("cursor")).toBe("2025-01-01T00:02:00");
  await expect(page.getByTestId("chart-history")).toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
});

test("selects a catalog symbol and resets candle requests to that symbol", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/candles?**", async (route) => {
    requests.push(route.request().url());
    const symbol = new URL(route.request().url()).searchParams.get("symbol") ?? "NDX";
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...initialWindow, candles: initialWindow.candles.map((candle) => ({ ...candle, symbol })), symbol }),
    });
  });

  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Market symbol" });
  await expect(selector).toHaveValue("NDX");
  await page.getByRole("button", { name: "Load older candles" }).click();
  await expect.poll(() => requests.length).toBe(2);
  await selector.selectOption("SPX");
  await expect(page.getByRole("heading", { name: "SPX · 1m" })).toBeVisible();
  await expect(page.getByRole("status", { name: "Older-window navigation is active." })).not.toBeVisible();
  await expect.poll(() => requests.length).toBe(3);
  expect(new URL(requests[0]).searchParams.get("symbol")).toBe("NDX");
  expect(new URL(requests[2]).searchParams.get("symbol")).toBe("SPX");
  expect(new URL(requests[2]).searchParams.has("cursor")).toBe(false);
});

test("retries an initial candle request failure on demand", async ({ page }) => {
  let attempts = 0;
  const clientEvents: unknown[] = [];
  await page.route("**/api/client-events", async (route) => {
    clientEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 202 });
  });
  await page.route("**/api/candles?**", (route) => {
    attempts += 1;
    return route.fulfill(
      attempts === 1
        ? { status: 500 }
        : { contentType: "application/json", body: JSON.stringify(initialWindow) },
    );
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Unable to load candles (500)");
  await page.getByRole("button", { name: "Retry loading candles" }).click();
  await expect(page.getByTestId("chart-history")).toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:03:00",
  );
  expect(attempts).toBe(2);
  await expect.poll(() => clientEvents).toEqual([
    { kind: "api_failure", message: "Unable to load candles (500)", path: "/" },
  ]);
});

test("keeps the chart visible after an older-window failure and retries", async ({ page }) => {
  let olderAttempts = 0;
  const clientEvents: unknown[] = [];
  await page.route("**/api/client-events", async (route) => {
    clientEvents.push(route.request().postDataJSON());
    await route.fulfill({ status: 202 });
  });
  await page.route("**/api/candles?**", async (route) => {
    const isOlderWindow = new URL(route.request().url()).searchParams.has("cursor");
    if (!isOlderWindow) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(initialWindow) });
      return;
    }
    olderAttempts += 1;
    await route.fulfill(
      olderAttempts === 1
        ? { status: 503 }
        : { contentType: "application/json", body: JSON.stringify(olderWindow) },
    );
  });

  await page.goto("/");
  await expect(page.getByTestId("chart-history")).toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:03:00",
  );
  await page.getByRole("button", { name: "Load older candles" }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to load candles (503)");
  await expect(page.getByTestId("chart-history")).toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:03:00",
  );

  await page.getByRole("button", { name: "Retry loading older candles" }).click();
  await expect(page.getByTestId("chart-history")).toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(olderAttempts).toBe(2);
  await expect.poll(() => clientEvents).toEqual([
    { kind: "api_failure", message: "Unable to load candles (503)", path: "/" },
  ]);
});
