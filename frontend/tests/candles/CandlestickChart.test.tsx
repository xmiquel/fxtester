import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { CandlestickChart } from "../../src/features/candles/CandlestickChart";
import { server } from "../mocks/server";

const chartInstances = vi.hoisted((): Array<{ remove: ReturnType<typeof vi.fn>; setData: ReturnType<typeof vi.fn> }> => []);

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
      timeScale: () => ({ fitContent: vi.fn() }),
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

  fireEvent.click(await screen.findByRole("button", { name: "Load older candles" }));

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

test("the production candle hook evicts the oldest window after three older pages", async () => {
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

  const button = await screen.findByRole("button", { name: "Load older candles" });
  fireEvent.click(button);
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  fireEvent.click(button);
  await expect(screen.findByTestId("chart-history")).resolves.toHaveAttribute(
    "data-candle-datetimes",
    "2025-01-01T00:02:00,2025-01-01T00:03:00,2025-01-01T00:04:00",
  );
  fireEvent.click(button);
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

  fireEvent.click(await screen.findByRole("button", { name: "Load older candles" }));
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
