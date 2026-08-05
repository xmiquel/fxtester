import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { CandlestickChart } from "../../src/features/candles/CandlestickChart";
import { server } from "../mocks/server";

const chartInstances = vi.hoisted((): Array<{ remove: ReturnType<typeof vi.fn>; setData: ReturnType<typeof vi.fn> }> => []);
const rangeHandlers = vi.hoisted((): Array<(range: { from: number; to: number } | null) => void> => []);

function navigateChartToStart() {
  const chart = screen.getByTestId("chart-history");
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
}

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: {},
  ColorType: { Solid: "solid" },
  createChart: vi.fn(() => {
    const instance = { remove: vi.fn(), setData: vi.fn() };
    chartInstances.push(instance);
    return {
      addSeries: () => ({ setData: instance.setData }),
      applyOptions: vi.fn(),
      remove: instance.remove,
      timeScale: () => ({
        fitContent: vi.fn(),
        subscribeVisibleLogicalRangeChange: vi.fn((handler) => { rangeHandlers.push(handler); }),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      }),
    };
  }),
}));

const candle = {
  OPEN: 100,
  close: 103,
  datetime: "2025-01-01T00:03:00",
  fecha_carga: "2025-01-01T00:03:00",
  high: 105,
  low: 99,
  origen: "test",
  spread: 1,
  symbol: "NDX",
  tickvol: 1,
  volume: 1,
};

test("renders an empty state when the bounded window contains no candles", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("No NDX 1m candles are available.")).toBeInTheDocument();
});

test("renders chronological, duplicate-free candles from adjacent cursor windows", async () => {
  chartInstances.length = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      if (cursor) {
        return HttpResponse.json({
          candles: [
            { ...candle, datetime: "2025-01-01T00:01:00", fecha_carga: "2025-01-01T00:01:00" },
            { ...candle, datetime: "2025-01-01T00:02:00", fecha_carga: "2025-01-01T00:02:00" },
            candle,
          ],
          has_more: false,
          next_cursor: null,
          symbol: "NDX",
          timeframe: "1m",
        });
      }
      return HttpResponse.json({
        candles: [candle],
        has_more: true,
        next_cursor: "2025-01-01T00:02:00",
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  navigateChartToStart();
  rangeHandlers[rangeHandlers.length - 1]?.({ from: 0, to: 10 });

  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(chartInstances.length).toBeGreaterThanOrEqual(2);
  expect(chartInstances.some((instance) => instance.remove.mock.calls.length === 1)).toBe(true);
  expect(chartInstances.at(-1)?.setData).toHaveBeenCalledWith(
    Array.from({ length: 3 }, () =>
      expect.objectContaining({ close: 103, high: 105, low: 99, open: 100, time: expect.any(Number) }),
    ),
  );
});

test("loads history only after navigation reaches the start after initial and recreated range delivery", async () => {
  let requests = 0;
  chartInstances.length = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      requests += 1;
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json(
        cursor
          ? {
              candles: [{ ...candle, datetime: "2025-01-01T00:02:00", fecha_carga: "2025-01-01T00:02:00" }],
              has_more: false,
              next_cursor: null,
              symbol: "NDX",
              timeframe: "1m",
            }
          : { candles: [candle], has_more: true, next_cursor: "2025-01-01T00:02:00", symbol: "NDX", timeframe: "1m" },
      );
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });
  expect(requests).toBe(1);

  rendered.rerender(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );
  expect(chartInstances).toHaveLength(2);
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });
  expect(requests).toBe(1);

  navigateChartToStart();
  rangeHandlers.at(-1)?.({ from: 4, to: 14 });
  rangeHandlers.at(-1)?.({ from: 3, to: 13 });
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(requests).toBe(2);
});

test("does not load history after a click is released before a passive range callback", async () => {
  let requests = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", () => {
      requests += 1;
      return HttpResponse.json({
        candles: [candle],
        has_more: true,
        next_cursor: "2025-01-01T00:02:00",
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  const chart = await screen.findByTestId("chart-history");
  fireEvent.pointerDown(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
  fireEvent.pointerUp(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
  fireEvent.pointerMove(chart, { clientX: 100, pointerId: 1, pointerType: "mouse" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  expect(requests).toBe(1);
});

test("loads history after a mouse pointer drag reaches the start", async () => {
  let requests = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      requests += 1;
      const cursor = new URL(request.url).searchParams.get("cursor");
      return HttpResponse.json({
        candles: [candle],
        has_more: cursor === null,
        next_cursor: cursor === null ? "2025-01-01T00:02:00" : null,
        symbol: "NDX",
        timeframe: "1m",
        ...(cursor ? { candles: [{ ...candle, datetime: "2025-01-01T00:02:00" }] } : {}),
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  navigateChartToStart();
  fireEvent.pointerUp(screen.getByTestId("chart-history"), { clientX: 10, pointerId: 1, pointerType: "mouse" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  await expect.poll(() => requests).toBe(2);
});

test("loads history after a touch pointer drag reaches the start", async () => {
  let requests = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", () => {
      requests += 1;
      return HttpResponse.json({
        candles: [candle],
        has_more: requests === 1,
        next_cursor: requests === 1 ? "2025-01-01T00:02:00" : null,
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  const chart = await screen.findByTestId("chart-history");
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 2, pointerType: "touch" });
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 2, pointerType: "touch" });
  fireEvent.pointerUp(chart, { clientX: 10, pointerId: 2, pointerType: "touch" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  await expect.poll(() => requests).toBe(2);
});

test("the production candle hook evicts the oldest window after three older pages", async () => {
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      const cursor = new URL(request.url).searchParams.get("cursor");
      const minute = cursor === null ? 4 : Number(cursor);
      return HttpResponse.json({
        candles: [
          {
            ...candle,
            datetime: `2025-01-01T00:0${minute}:00`,
            fecha_carga: `2025-01-01T00:0${minute}:00`,
          },
        ],
        has_more: minute > 1,
        next_cursor: minute > 1 ? String(minute - 1) : null,
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  const getHandler = () => rangeHandlers[rangeHandlers.length - 1];

  await screen.findByTestId("chart-history");
  navigateChartToStart();
  getHandler()?.({ from: 0, to: 10 });
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  navigateChartToStart();
  getHandler()?.({ from: 0, to: 10 });
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:02:00,2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  navigateChartToStart();
  getHandler()?.({ from: 0, to: 10 });
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
});

test("retries an initial candle request failure on demand", async () => {
  let attempts = 0;
  server.use(
    http.get("*/api/candles", () => {
      attempts += 1;
      return attempts === 1
        ? new HttpResponse(null, { status: 500 })
        : HttpResponse.json({ candles: [candle], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load candles (500)");
  fireEvent.click(screen.getByRole("button", { name: "Retry loading candles" }));
  expect(await screen.findByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", candle.datetime);
  expect(attempts).toBe(2);
});

test("keeps rendered candles when an older window fails and retries on demand", async () => {
  let olderAttempts = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      if (new URL(request.url).searchParams.has("cursor")) {
        olderAttempts += 1;
        if (olderAttempts === 1) {
          return new HttpResponse(null, { status: 503 });
        }
        return HttpResponse.json({
          candles: [{ ...candle, datetime: "2025-01-01T00:02:00", fecha_carga: "2025-01-01T00:02:00" }],
          has_more: false,
          next_cursor: null,
          symbol: "NDX",
          timeframe: "1m",
        });
      }
      return HttpResponse.json({
        candles: [candle],
        has_more: true,
        next_cursor: "2025-01-01T00:02:00",
        symbol: "NDX",
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  navigateChartToStart();
  rangeHandlers[rangeHandlers.length - 1]?.({ from: 0, to: 10 });
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load candles (503)");
  expect(screen.getByTestId("chart-history")).toHaveAttribute("data-candle-datetimes", candle.datetime);

  fireEvent.click(screen.getByRole("button", { name: "Retry loading older candles" }));
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(olderAttempts).toBe(2);
});

test("renders with a non-default timeframe and updates heading and aria-label", async () => {
  chartInstances.length = 0;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({ candles: [candle], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "5m" }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="5m" />
    </QueryClientProvider>,
  );

  await expect(screen.findByRole("heading", { name: "NDX · 5m" })).resolves.toBeInTheDocument();
  expect(await screen.findByTestId("chart-history")).toHaveAttribute(
    "aria-label",
    "NDX 5m candlestick chart",
  );
});

test("removes the active chart instance when the chart unmounts", async () => {
  chartInstances.length = 0;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({ candles: [candle], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  rendered.unmount();

  expect(chartInstances).toHaveLength(1);
  expect(chartInstances[0].remove).toHaveBeenCalledOnce();
});
