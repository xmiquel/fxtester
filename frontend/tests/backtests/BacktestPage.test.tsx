import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { App } from "../../src/App";
import { server } from "../mocks/server";

vi.mock("lightweight-charts", () => ({
  CandlestickSeries: {},
  ColorType: { Solid: "solid" },
  createChart: vi.fn(() => ({
    addSeries: () => ({ setData: vi.fn() }),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
  })),
}));

interface BacktestPayload {
  limit: number;
  strategy: string;
  symbol: string;
  timeframe: string;
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

test("discovers strategies, submits the shared timeframe and period, and displays the result window", async () => {
  const requests: BacktestPayload[] = [];
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "5m"])),
    http.get("*/api/candles", ({ request }) => {
      const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "NDX", timeframe });
    }),
    http.get("*/api/backtests/strategies", () =>
      HttpResponse.json([
        {
          name: "sma_cross",
          label: "SMA crossover",
          description: "Trade long when averages cross.",
          parameters: [
            { name: "fast_window", label: "Fast window", kind: "integer", default: 10, minimum: 1, maximum: 500 },
            { name: "slow_window", label: "Slow window", kind: "integer", default: 30, minimum: 2, maximum: 1000 },
          ],
        },
      ]),
    ),
    http.post("*/api/backtests", async ({ request }) => {
      const payload = (await request.json()) as BacktestPayload;
      requests.push(payload);
      return HttpResponse.json({
        symbol: payload.symbol,
        timeframe: payload.timeframe,
        strategy: payload.strategy,
        start_datetime: "2025-01-01T00:00:00",
        end_datetime: "2025-01-01T08:19:00",
        candle_count: payload.limit,
        initial_cash: 10000,
        final_value: 10000,
        total_return: 0,
        max_drawdown: 0,
        sharpe_ratio: null,
        total_trades: 0,
      });
    }),
  );

  renderApp();
  const timeframe = await screen.findByRole("combobox", { name: "Timeframe" });
  fireEvent.change(timeframe, { target: { value: "5m" } });
  await screen.findByText("No NDX 5m candles are available.");
  fireEvent.click(screen.getByRole("tab", { name: "Backtest" }));

  expect(await screen.findByRole("heading", { name: "Backtest a strategy" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Timeframe" })).toHaveValue("5m");
  fireEvent.change(screen.getByRole("combobox", { name: "Evaluation period/window" }), {
    target: { value: "5000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Run backtest" }));

  expect(await screen.findByRole("heading", { name: "SMA crossover" })).toBeInTheDocument();
  expect(screen.getByText("2025-01-01T00:00:00")).toBeInTheDocument();
  expect(screen.getByText("2025-01-01T08:19:00")).toBeInTheDocument();
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  expect(requests).toEqual([
    expect.objectContaining({ limit: 5000, strategy: "sma_cross", symbol: "NDX", timeframe: "5m" }),
  ]);
});
