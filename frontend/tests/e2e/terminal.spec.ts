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

const PAGE_SIZE = 1000;

const initialWindow = {
  symbol: "NDX",
  timeframe: "1m",
  candles: Array.from({ length: PAGE_SIZE }, (_, index) => candleAt(index + PAGE_SIZE)),
  next_cursor: new Date(Date.UTC(2025, 0, 1, 0, PAGE_SIZE)).toISOString().slice(0, 19),
  has_more: true,
};

const olderWindow = {
  ...initialWindow,
  candles: Array.from({ length: PAGE_SIZE }, (_, index) => candleAt(index)),
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
  const canvas = page.getByRole("region", { name: "NDX 1m candlestick chart" });
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

test("renders initial loaded history and requests older history only after navigation", async ({ page }) => {
  const requests: string[] = [];
  await page.route("**/api/candles?**", async (route) => {
    requests.push(route.request().url());
    const isOlderWindow = new URL(route.request().url()).searchParams.has("cursor");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(isOlderWindow ? olderWindow : initialWindow) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Trading Terminal" })).toBeVisible();
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);

  await panChartRight(page);
  await expect.poll(() => requests.length).toBe(2);
  expect(new URL(requests[1]).searchParams.get("cursor")).toBe("2025-01-01T16:40:00");
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toHaveAttribute("data-candle-datetimes", /2025-01-01T00:00:00/);
});

test("shows and clears the candle data window as the crosshair enters and leaves a candle", async ({ page }) => {
  await page.route("**/api/candles?**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(initialWindow) }),
  );

  await page.goto("/");
  const chart = page.getByRole("region", { name: "NDX 1m candlestick chart" });
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  if (!box) throw new Error("Chart canvas not found");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const dataWindow = page.getByRole("complementary", { name: "Candle data window" });
  for (const label of ["Timestamp (UTC)", "Open", "High", "Low", "Close", "Volume"]) {
    await expect(dataWindow.getByText(label, { exact: true })).toBeVisible();
  }
  const values = dataWindow.getByRole("definition");
  await expect(values.nth(0)).toHaveText(/^2025-01-\d{2}T\d{2}:\d{2}:\d{2}$/);
  await expect(values.nth(1)).toHaveText("100");
  await expect(values.nth(2)).toHaveText("105");
  await expect(values.nth(3)).toHaveText("99");
  await expect(values.nth(4)).toHaveText("103");
  await expect(values.nth(5)).toHaveText("1");

  await page.mouse.move(box.x - 10, box.y + box.height / 2);
  await expect(dataWindow.getByRole("definition")).toHaveText(["", "", "", "", "", ""]);
  await expect(dataWindow.getByRole("status", { name: "No candle selected." })).toHaveClass(/visually-hidden/);
});

test("places the data window beside the chart on desktop and below it on narrow screens", async ({ page }) => {
  await page.route("**/api/candles?**", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(initialWindow) }),
  );

  await page.goto("/");
  const chart = page.getByRole("region", { name: "NDX 1m candlestick chart" });
  const dataWindow = page.getByRole("complementary", { name: "Candle data window" });
  await expect(chart).toBeVisible();
  await expect(dataWindow).toBeVisible();

  const desktopChartBox = await chart.boundingBox();
  const desktopDataWindowBox = await dataWindow.boundingBox();
  if (!desktopChartBox || !desktopDataWindowBox) throw new Error("Chart layout is not measurable");
  expect(desktopDataWindowBox.x).toBeGreaterThan(desktopChartBox.x + desktopChartBox.width);

  await page.setViewportSize({ width: 640, height: 720 });
  await expect(dataWindow).toBeVisible();
  const narrowChartBox = await chart.boundingBox();
  const narrowDataWindowBox = await dataWindow.boundingBox();
  if (!narrowChartBox || !narrowDataWindowBox) throw new Error("Narrow chart layout is not measurable");
  expect(narrowDataWindowBox.x).toBe(narrowChartBox.x);
  expect(narrowDataWindowBox.y).toBeGreaterThan(narrowChartBox.y + narrowChartBox.height);
});

test("keeps a millisecond timestamp inside the data window while showing its labels", async ({ page }) => {
  const longTimestamp = "2025-01-01T03:20:00.123";
  await page.route("**/api/candles?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...initialWindow,
        candles: [{ ...initialWindow.candles[0], datetime: longTimestamp, fecha_carga: longTimestamp }, ...initialWindow.candles.slice(1)],
      }),
    }),
  );

  await page.goto("/");
  const chart = page.getByRole("region", { name: "NDX 1m candlestick chart" });
  const dataWindow = page.getByRole("complementary", { name: "Candle data window" });
  await expect(chart).toBeVisible();
  await chart.focus();
  await chart.press("Home");

  for (const label of ["Timestamp (UTC)", "Open", "High", "Low", "Close", "Volume"]) {
    await expect(dataWindow.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(dataWindow.getByRole("definition").nth(0)).toHaveText(longTimestamp);

  const bounds = await dataWindow.evaluate((element) => {
    const windowBox = element.getBoundingClientRect();
    const childRight = Math.max(
      ...Array.from(element.querySelectorAll("dt, dd"), (child) => child.getBoundingClientRect().right),
    );
    return {
      childRight,
      clientWidth: element.clientWidth,
      right: windowBox.right,
      scrollWidth: element.scrollWidth,
    };
  });
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  expect(bounds.childRight).toBeLessThanOrEqual(bounds.right);
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
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toHaveAttribute("data-candle-datetimes", /2025-01-01T16:40:00/);
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
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toHaveAttribute("data-candle-datetimes", /2025-01-01T16:40:00/);
  await panChartRight(page);
  await expect.poll(() => olderRequests.length).toBeGreaterThan(0);
  expect(new URL(olderRequests[0]).searchParams.get("cursor")).toBe("2025-01-01T16:40:00");
  await expect(page.getByRole("alert")).toContainText("Unable to load candles (503)");
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toHaveAttribute("data-candle-datetimes", /2025-01-01T16:40:00/);

  const failedOlderAttempts = olderAttempts;
  retryOlderWindow = true;
  await page.getByRole("button", { name: "Retry loading older candles" }).click();
  await expect(page.getByRole("region", { name: "NDX 1m candlestick chart" })).toHaveAttribute("data-candle-datetimes", /2025-01-01T00:00:00/);
  expect(olderAttempts).toBe(failedOlderAttempts + 1);
  await expect.poll(() => clientEvents).toEqual(
    Array.from({ length: failedOlderAttempts }, () => ({
      kind: "api_failure",
      message: "Unable to load candles (503)",
      path: "/",
    })),
  );
});
