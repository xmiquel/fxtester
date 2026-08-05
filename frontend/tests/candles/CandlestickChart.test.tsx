import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createChart } from "lightweight-charts";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { CandlestickChart } from "../../src/features/candles/CandlestickChart";
import { server } from "../mocks/server";

interface CrosshairMoveParam {
  point?: { x: number; y: number };
  seriesData: Map<unknown, unknown>;
  time?: number;
}

interface ChartInstance {
  remove: ReturnType<typeof vi.fn>;
  setData: ReturnType<typeof vi.fn>;
  unsubscribeCrosshairMove: ReturnType<typeof vi.fn>;
}

const chartInstances = vi.hoisted((): ChartInstance[] => []);
const rangeHandlers = vi.hoisted((): Array<(range: { from: number; to: number } | null) => void> => []);
const crosshairHandlers = vi.hoisted((): Array<(param: CrosshairMoveParam) => void> => []);
const candleSeriesInstances = vi.hoisted((): object[] => []);

function navigateChartToStart() {
  const chart = screen.getByTestId("chart-history");
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
}

function leaveChart(chart: HTMLElement, relatedTarget: EventTarget | null) {
  const event = createEvent.pointerOut(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  Object.defineProperty(event, "relatedTarget", { value: relatedTarget });
  fireEvent(chart, event);
}

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: {},
  ColorType: { Solid: "solid" },
  createChart: vi.fn(() => {
    const instance = { remove: vi.fn(), setData: vi.fn(), unsubscribeCrosshairMove: vi.fn() };
    const series = { setData: instance.setData };
    chartInstances.push(instance);
    candleSeriesInstances.push(series);
    return {
      addSeries: () => series,
      applyOptions: vi.fn(),
      remove: instance.remove,
      subscribeCrosshairMove: vi.fn((handler) => { crosshairHandlers.push(handler); }),
      unsubscribeCrosshairMove: instance.unsubscribeCrosshairMove,
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

test("shows the hovered candle OHLC data window and clears it outside the chart or without candle data", async () => {
  chartInstances.length = 0;
  crosshairHandlers.length = 0;
  candleSeriesInstances.length = 0;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({ candles: [candle], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  const chartTime = Math.floor(Date.UTC(2025, 0, 1, 0, 3, 0) / 1000);
  expect(chartInstances.at(-1)?.setData).toHaveBeenCalledWith([
    expect.objectContaining({ time: chartTime }),
  ]);
  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: 10, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: chartTime,
    });
  });

  const dataWindow = await screen.findByRole("complementary", { name: "Candle data window" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");
  expect(dataWindow).toHaveTextContent("Open100");
  expect(dataWindow).toHaveTextContent("High105");
  expect(dataWindow).toHaveTextContent("Low99");
  expect(dataWindow).toHaveTextContent("Close103");
  expect(dataWindow).toHaveTextContent("Volume1");
  expect(createChart).toHaveBeenLastCalledWith(
    expect.any(HTMLDivElement),
    expect.objectContaining({ timeScale: { secondsVisible: false, timeVisible: true } }),
  );

  act(() => {
    crosshairHandlers.at(-1)?.({ point: undefined, seriesData: new Map(), time: undefined });
  });
  expect(dataWindow).toHaveTextContent("No candle selected.");

  act(() => {
    crosshairHandlers.at(-1)?.({ point: { x: 10, y: 10 }, seriesData: new Map(), time: chartTime });
  });
  expect(dataWindow).toHaveTextContent("No candle selected.");

  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: 10, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: chartTime,
    });
  });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");

  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: -1, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: chartTime,
    });
  });
  expect(dataWindow).toHaveTextContent("No candle selected.");
});

test("selects candles from the keyboard and exposes instructions and live readout", async () => {
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({
        candles: [
          { ...candle, datetime: "2025-01-01T00:02:00", fecha_carga: "2025-01-01T00:02:00" },
          candle,
        ],
        has_more: false,
        next_cursor: null,
        symbol: "NDX",
        timeframe: "1m",
      }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  const chart = await screen.findByRole("region", { name: "NDX 1m candlestick chart" });
  const dataWindow = screen.getByRole("complementary", { name: "Candle data window" });
  expect(chart).toHaveAttribute("tabindex", "0");
  expect(chart).toHaveAccessibleDescription(
    "Use Left and Right Arrow keys to select candles. Press Home for the first candle or End for the last candle. Pointer hover also inspects candles. No candle selected.",
  );

  chart.focus();
  fireEvent.keyDown(chart, { key: "End" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");
  fireEvent.keyDown(chart, { key: "Home" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:02:00");
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");
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

test("does not load history after an external pointer leave cancels an in-progress drag", async () => {
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
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  leaveChart(chart, document.body);
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  expect(requests).toBe(1);
});

test("keeps an in-progress drag when the pointer moves to a contained related target", async () => {
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
  const relatedTarget = document.createElement("span");
  chart.append(relatedTarget);
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  leaveChart(chart, relatedTarget);
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  await expect.poll(() => requests).toBe(2);
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

test("chart recreation clears hovered data when bounded paging evicts its candle", async () => {
  rangeHandlers.length = 0;
  crosshairHandlers.length = 0;
  candleSeriesInstances.length = 0;
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
  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: 10, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: Math.floor(Date.UTC(2025, 0, 1, 0, 4, 0) / 1000),
    });
  });
  expect(await screen.findByRole("complementary", { name: "Candle data window" })).toHaveTextContent(
    "Timestamp (UTC)2025-01-01T00:04:00",
  );
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
  expect(screen.getByRole("complementary", { name: "Candle data window" })).toHaveTextContent("No candle selected.");
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
  expect(chartInstances[0].unsubscribeCrosshairMove).toHaveBeenCalledOnce();
});
