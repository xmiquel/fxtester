import { expect, test, type Page } from "@playwright/test";

function candleAt(minute: number) {
  const datetime = new Date(Date.UTC(2025, 0, 1, 0, minute)).toISOString().slice(0, 19);
  return {
    datetime,
    symbol: "NDX",
    OPEN: 100,
    high: 105,
    low: 99,
    close: 103,
    tickvol: 1,
    volume: 1,
    spread: 1,
    origen: "test",
    fecha_carga: datetime,
  };
}

const initialWindow = {
  symbol: "NDX",
  timeframe: "1m",
  candles: Array.from({ length: 200 }, (_, index) => candleAt(index + 200)),
  next_cursor: "2025-01-01T03:19:00",
  has_more: true,
};

const olderWindow = {
  ...initialWindow,
  candles: Array.from({ length: 200 }, (_, index) => candleAt(index)),
  next_cursor: null,
  has_more: false,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/symbols", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ symbols: ["NDX", "SPX"] }) }),
  );
  await page.route("**/api/timeframes", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(["1m", "5m", "15m", "1h"]) }),
  );
});

async function panChartRight(page: Page) {
  const canvas = page.getByTestId("chart-history");
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Chart canvas not found");
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 300, startY, { steps: 15 });
  await page.mouse.up();
}

test("renders one bounded window and requests older history only after navigation", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/candles?**", async (route) => {
    requests.push(route.request().url());
    const isOlderWindow = new URL(route.request().url()).searchParams.has("cursor");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(isOlderWindow ? olderWindow : initialWindow) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trading Terminal" })).toBeVisible();
  await expect(page.getByTestId("chart-history")).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);

  await panChartRight(page);
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1]).searchParams.get("cursor")).toBe("2025-01-01T03:19:00");
  await expect(page.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", /2025-01-01T00:00:00/);
});

test("selects a catalog symbol and resets candle requests to that symbol", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/candles?**", async (route) => {
    requests.push(route.request().url());
    const requestUrl = new URL(route.request().url());
    const symbol = requestUrl.searchParams.get("symbol") ?? "NDX";
    const window = requestUrl.searchParams.has("cursor") ? olderWindow : initialWindow;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...window, candles: window.candles.map((candle) => ({ ...candle, symbol })), symbol }),
    });
  });

  await page.goto("/");
  const selector = page.getByRole("combobox", { name: "Market symbol" });
  await expect(selector).toHaveValue("NDX");
  await panChartRight(page);
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
    return route.fulfill(attempts === 1 ? { status: 500 } : { contentType: "application/json", body: JSON.stringify(initialWindow) });
  });

  await page.goto("/");

  await expect(page.getByRole("alert")).toContainText("Unable to load candles (500)");
  await page.getByRole("button", { name: "Retry loading candles" }).click();
  await expect(page.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", /2025-01-01T03:20:00/);
  expect(attempts).toBe(2);
  await expect.poll(() => clientEvents).toEqual([{ kind: "api_failure", message: "Unable to load candles (500)", path: "/" }]);
});

test("keeps the chart visible after an older-window failure and retries", async ({ page }) => {
  let olderAttempts = 0;
  let retryOlderWindow = false;
  const olderRequests: string[] = [];
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
    olderRequests.push(route.request().url());
    olderAttempts += 1;
    await route.fulfill(
      retryOlderWindow ? { contentType: "application/json", body: JSON.stringify(olderWindow) } : { status: 503 },
    );
  });

  await page.goto("/");
  await expect(page.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", /2025-01-01T03:20:00/);
  await panChartRight(page);
  await expect.poll(() => olderRequests.length).toBeGreaterThan(0);
  expect(new URL(olderRequests[0]).searchParams.get("cursor")).toBe("2025-01-01T03:19:00");
  await expect(page.getByRole("alert")).toContainText("Unable to load candles (503)");
  await expect(page.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", /2025-01-01T03:20:00/);

  const failedOlderAttempts = olderAttempts;
  retryOlderWindow = true;
  await page.getByRole("button", { name: "Retry loading older candles" }).click();
  await expect(page.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", /2025-01-01T00:00:00/);
  expect(olderAttempts).toBe(failedOlderAttempts + 1);
  await expect.poll(() => clientEvents).toEqual(
    Array.from({ length: failedOlderAttempts }, () => ({
      kind: "api_failure",
      message: "Unable to load candles (503)",
      path: "/",
    })),
  );
});
