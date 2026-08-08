import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { createChart } from "lightweight-charts";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { CandlestickChart } from "../../src/features/candles/CandlestickChart";
import { candleWindowPolicy } from "../../src/features/candles/useCandleWindow";
import { candleWindowQueryKey } from "../../src/features/candles/queryKeys";
import { server } from "../mocks/server";

interface CrosshairMoveParam {
  point?: { x: number; y: number };
  seriesData: Map<unknown, unknown>;
  time?: number;
}

interface ChartInstance {
  fitContent: ReturnType<typeof vi.fn>;
  getVisibleLogicalRange: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  setVisibleLogicalRange: ReturnType<typeof vi.fn>;
  setData: ReturnType<typeof vi.fn>;
  unsubscribeCrosshairMove: ReturnType<typeof vi.fn>;
  visibleRange: { from: number; to: number };
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
    const visibleRange = { from: 0, to: 10 };
    const instance = {
      fitContent: vi.fn(),
      getVisibleLogicalRange: vi.fn(() => visibleRange),
      remove: vi.fn(),
      setVisibleLogicalRange: vi.fn((range: { from: number; to: number }) => {
        visibleRange.from = range.from;
        visibleRange.to = range.to;
      }),
      setData: vi.fn(),
      unsubscribeCrosshairMove: vi.fn(),
      visibleRange,
    };
    const series = { setData: instance.setData };
    const timeScale = {
      fitContent: instance.fitContent,
      getVisibleLogicalRange: instance.getVisibleLogicalRange,
      setVisibleLogicalRange: instance.setVisibleLogicalRange,
      subscribeVisibleLogicalRangeChange: vi.fn((handler) => { rangeHandlers.push(handler); }),
      unsubscribeVisibleLogicalRangeChange: vi.fn(),
    };
    chartInstances.push(instance);
    candleSeriesInstances.push(series);
    return {
      addSeries: () => series,
      applyOptions: vi.fn(),
      remove: instance.remove,
      subscribeCrosshairMove: vi.fn((handler) => { crosshairHandlers.push(handler); }),
      unsubscribeCrosshairMove: instance.unsubscribeCrosshairMove,
      timeScale: () => timeScale,
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

test("renders chronological, duplicate-free candles from adjacent cursor windows without recreating the chart", async () => {
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
  expect(screen.getByText("Loaded history")).toBeInTheDocument();
  navigateChartToStart();
  rangeHandlers[rangeHandlers.length - 1]?.({ from: 0, to: 10 });

  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(chartInstances).toHaveLength(1);
  expect(chartInstances[0].remove).not.toHaveBeenCalled();
  expect(chartInstances[0].fitContent).toHaveBeenCalledOnce();
  expect(chartInstances[0].setVisibleLogicalRange).toHaveBeenCalledWith({ from: 2, to: 12 });
  expect(chartInstances[0].setData).toHaveBeenCalledWith(
    Array.from({ length: 3 }, () =>
      expect.objectContaining({ close: 103, high: 105, low: 99, open: 100, time: expect.any(Number) }),
    ),
  );
});

test("surfaces a duplicate timestamp returned within the initial backend page", async () => {
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({
        candles: [candle, { ...candle, close: 999 }],
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

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Candle response contains duplicate timestamp: 2025-01-01T00:03:00",
  );
  expect(screen.queryByRole("region", { name: "NDX 1m candlestick chart" })).not.toBeInTheDocument();
});

test("keeps the OHLC data window visible with blank values until a candle is selected", async () => {
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
  const dataWindow = screen.getByRole("complementary", { name: "Candle data window" });
  expect(dataWindow).toBeVisible();
  expect(within(dataWindow).getByText("Timestamp (UTC)")).toBeInTheDocument();
  expect(within(dataWindow).getByText("Open")).toBeInTheDocument();
  expect(within(dataWindow).getByText("High")).toBeInTheDocument();
  expect(within(dataWindow).getByText("Low")).toBeInTheDocument();
  expect(within(dataWindow).getByText("Close")).toBeInTheDocument();
  expect(within(dataWindow).getByText("Volume")).toBeInTheDocument();
  for (const value of within(dataWindow).getAllByRole("definition")) {
    expect(value).toBeEmptyDOMElement();
  }
  expect(within(dataWindow).getByRole("status", { name: "No candle selected." })).toHaveClass("visually-hidden");

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
  for (const value of within(dataWindow).getAllByRole("definition")) {
    expect(value).toBeEmptyDOMElement();
  }

  act(() => {
    crosshairHandlers.at(-1)?.({ point: { x: 10, y: 10 }, seriesData: new Map(), time: chartTime });
  });
  for (const value of within(dataWindow).getAllByRole("definition")) {
    expect(value).toBeEmptyDOMElement();
  }

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
  for (const value of within(dataWindow).getAllByRole("definition")) {
    expect(value).toBeEmptyDOMElement();
  }
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
  expect(chart).toHaveAccessibleDescription(/Use Left and Right Arrow keys to select candles/);
  expect(chart).toHaveAccessibleDescription(/No candle selected/);

  chart.focus();
  fireEvent.keyDown(chart, { key: "End" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");
  fireEvent.keyDown(chart, { key: "Home" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:02:00");
  fireEvent.keyDown(chart, { key: "ArrowRight" });
  expect(dataWindow).toHaveTextContent("Timestamp (UTC)2025-01-01T00:03:00");
});

test("loads history only after navigation reaches the start after initial passive range delivery", async () => {
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
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });
  expect(requests).toBe(1);

  rendered.rerender(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );
  expect(chartInstances).toHaveLength(1);
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });
  expect(requests).toBe(1);

  navigateChartToStart();
  rangeHandlers.at(-1)?.({ from: 1001, to: 1011 });
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
  expect(requests).toBe(2);
});

test("clears navigation intent when the chart identity changes while preserving drag-gated prefetch", async () => {
  const requests: string[] = [];
  chartInstances.length = 0;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      requests.push(request.url);
      const requestUrl = new URL(request.url);
      const symbol = requestUrl.searchParams.get("symbol") ?? "NDX";
      const cursor = requestUrl.searchParams.get("cursor");
      return HttpResponse.json({
        candles: [{ ...candle, symbol }],
        has_more: cursor === null,
        next_cursor: cursor === null ? "older" : null,
        symbol,
        timeframe: "1m",
      });
    }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByRole("region", { name: "NDX 1m candlestick chart" });
  navigateChartToStart();
  rendered.rerender(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="SPX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByRole("region", { name: "SPX 1m candlestick chart" });
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });
  await expect.poll(() => requests.length).toBe(2);

  navigateChartToStart();
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });
  await expect.poll(() => requests.length).toBe(3);
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
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });

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
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });

  await expect.poll(() => requests).toBe(2);
});

test("retains every loaded candle and preserves one chart instance across four pages", async () => {
  chartInstances.length = 0;
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
  await expect.poll(() => screen.getByTestId("chart-history").getAttribute("data-candle-datetimes")).toBe(
    "2025-01-01T00:02:00,2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  navigateChartToStart();
  getHandler()?.({ from: 0, to: 10 });
  await expect.poll(() => screen.getByTestId("chart-history").getAttribute("data-candle-datetimes")).toBe(
    "2025-01-01T00:01:00,2025-01-01T00:02:00,2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  expect(chartInstances).toHaveLength(1);
  expect(chartInstances[0].remove).not.toHaveBeenCalled();
  expect(chartInstances[0].fitContent).toHaveBeenCalledOnce();
  expect(chartInstances[0].setData).toHaveBeenCalledTimes(4);
});

test("does not issue a duplicate prefetch while an older page is loading", async () => {
  let requests = 0;
  let resolveOlder: (() => void) | undefined;
  rangeHandlers.length = 0;
  server.use(
    http.get("*/api/candles", ({ request }) => {
      requests += 1;
      const cursor = new URL(request.url).searchParams.get("cursor");
      if (cursor !== null) {
        return new Promise((resolve) => {
          resolveOlder = () => resolve(HttpResponse.json({
            candles: [{ ...candle, datetime: "2025-01-01T00:02:00", fecha_carga: "2025-01-01T00:02:00" }],
            has_more: false,
            next_cursor: null,
            symbol: "NDX",
            timeframe: "1m",
          }));
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

  const chart = await screen.findByTestId("chart-history");
  fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1, pointerType: "mouse" });
  fireEvent.pointerMove(chart, { clientX: 10, pointerId: 1, pointerType: "mouse" });
  rangeHandlers.at(-1)?.({ from: 1000, to: 1010 });
  rangeHandlers.at(-1)?.({ from: 999, to: 1009 });

  await expect.poll(() => requests).toBe(2);
  act(() => {
    resolveOlder?.();
  });
  await expect.poll(() => screen.getByTestId("chart-history").getAttribute("data-candle-datetimes")).toBe(
    "2025-01-01T00:02:00,2025-01-01T00:03:00",
  );
});

test("refreshes chart OHLC values when a refetch keeps the same candle boundaries", async () => {
  chartInstances.length = 0;
  let close = 103;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({ candles: [{ ...candle, close }], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  const chart = chartInstances.at(-1);
  expect(chart?.setData).toHaveBeenCalledWith([expect.objectContaining({ close: 103 })]);

  close = 999;
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: null, limit: candleWindowPolicy.limit }),
    });
  });

  await expect.poll(() => chart?.setData.mock.calls.length).toBe(2);
  expect(chart?.setData).toHaveBeenLastCalledWith([expect.objectContaining({ close: 999 })]);
});

test("refreshes the selected data window when a refetch replaces the same candle", async () => {
  let close = 103;
  let volume = 1;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({ candles: [{ ...candle, close, volume }], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" }),
    ),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByTestId("chart-history");
  const dataWindow = screen.getByRole("complementary", { name: "Candle data window" });
  const chartTime = Math.floor(Date.UTC(2025, 0, 1, 0, 3, 0) / 1000);
  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: 10, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: chartTime,
    });
  });
  expect(dataWindow).toHaveTextContent("Close103");
  expect(dataWindow).toHaveTextContent("Volume1");

  close = 999;
  volume = 7;
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: null, limit: candleWindowPolicy.limit }),
    });
  });

  await expect.poll(() => dataWindow.textContent).toContain("Close999");
  expect(dataWindow).toHaveTextContent("Volume7");
});

test("clears the selected data window when a refetch removes its datetime", async () => {
  let includeSelectedCandle = true;
  server.use(
    http.get("*/api/candles", () =>
      HttpResponse.json({
        candles: [
          includeSelectedCandle
            ? candle
            : { ...candle, datetime: "2025-01-01T00:04:00", fecha_carga: "2025-01-01T00:04:00" },
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

  await screen.findByTestId("chart-history");
  const dataWindow = screen.getByRole("complementary", { name: "Candle data window" });
  act(() => {
    crosshairHandlers.at(-1)?.({
      point: { x: 10, y: 10 },
      seriesData: new Map([[candleSeriesInstances.at(-1), { close: 103, high: 105, low: 99, open: 100 }]]),
      time: Math.floor(Date.UTC(2025, 0, 1, 0, 3, 0) / 1000),
    });
  });
  expect(dataWindow).toHaveTextContent("Close103");

  includeSelectedCandle = false;
  await act(async () => {
    await queryClient.refetchQueries({
      queryKey: candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: null, limit: candleWindowPolicy.limit }),
    });
  });

  await expect.poll(() => dataWindow.textContent).not.toContain("Close103");
  expect(within(dataWindow).getByRole("status", { name: "No candle selected." })).toBeInTheDocument();
  for (const value of within(dataWindow).getAllByRole("definition")) {
    expect(value).toBeEmptyDOMElement();
  }
});

test("does not request another page at the exact 20,000-candle safety limit", async () => {
  let requests = 0;
  server.use(
    http.get("*/api/candles", () => {
      requests += 1;
      return HttpResponse.json({ candles: [candle], has_more: false, next_cursor: null, symbol: "NDX", timeframe: "1m" });
    }),
  );
  const fullPageCount = candleWindowPolicy.maxRetainedCandles / candleWindowPolicy.limit - 1;
  const pages = Array.from({ length: fullPageCount }, (_, pageIndex) => ({
    candles: Array.from({ length: candleWindowPolicy.limit }, (_, candleIndex) => ({
      ...candle,
      datetime: new Date(Date.UTC(2025, 0, 1, 0, pageIndex * candleWindowPolicy.limit + candleIndex)).toISOString().slice(0, 19),
      fecha_carga: new Date(Date.UTC(2025, 0, 1, 0, pageIndex * candleWindowPolicy.limit + candleIndex)).toISOString().slice(0, 19),
    })),
    has_more: true,
    next_cursor: `cursor-${pageIndex + 1}`,
    symbol: "NDX",
    timeframe: "1m",
  }));
  pages.push({
    candles: Array.from({ length: candleWindowPolicy.limit }, (_, candleIndex) => ({
      ...candle,
      datetime: new Date(Date.UTC(2025, 0, 1, 0, fullPageCount * candleWindowPolicy.limit + candleIndex)).toISOString().slice(0, 19),
      fecha_carga: new Date(Date.UTC(2025, 0, 1, 0, fullPageCount * candleWindowPolicy.limit + candleIndex)).toISOString().slice(0, 19),
    })),
    has_more: true,
    next_cursor: "cursor-after-cap-page",
    symbol: "NDX",
    timeframe: "1m",
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(candleWindowQueryKey({ symbol: "NDX", timeframe: "1m", cursor: null, limit: candleWindowPolicy.limit }), {
    pages,
    pageParams: pages.map((_, pageIndex) => (pageIndex === 0 ? null : `cursor-${pageIndex}`)),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CandlestickChart symbol="NDX" timeframe="1m" />
    </QueryClientProvider>,
  );

  await screen.findByRole("region", { name: "NDX 1m candlestick chart" });
  expect(screen.getByText("20,000-candle safety limit reached; older history loading stops at the safety limit.")).toBeInTheDocument();
  navigateChartToStart();
  rangeHandlers.at(-1)?.({ from: 0, to: 10 });

  expect(requests).toBe(0);
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
