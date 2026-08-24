import { expect, test, vi } from "vitest";

vi.mock("../../src/observability", () => ({
  CLIENT_EVENT_KIND: { API_FAILURE: "api_failure" },
  reportClientEvent: vi.fn(),
}));

import {
  fetchBacktestPeriod,
  fetchStrategyDefinitions,
  submitBacktest,
  type BacktestRequest,
} from "../../src/features/backtests/api";

test("maps the strategy catalog response and forwards its AbortSignal", async () => {
  const controller = new AbortController();
  const catalog = [
    {
      name: "sma_cross",
      label: "SMA crossover",
      description: "Trade long when averages cross.",
      parameters: [
        { name: "fast_window", label: "Fast window", kind: "integer" as const, default: 10, minimum: 1, maximum: 500 },
      ],
    },
  ];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(catalog), { status: 200 }),
  );

  await expect(fetchStrategyDefinitions(controller.signal)).resolves.toEqual(catalog);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/backtests/strategies"), {
    signal: controller.signal,
  });
  fetchMock.mockRestore();
});

test("discovers the available period for a symbol and timeframe", async () => {
  const controller = new AbortController();
  const period = {
    start_datetime: "2025-01-01T00:00:00",
    end_datetime: "2025-01-01T08:19:00",
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(period), { status: 200 }),
  );

  await expect(fetchBacktestPeriod("NDX", "5m", controller.signal)).resolves.toEqual(period);
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining("/backtests/period?symbol=NDX&timeframe=5m"),
    { signal: controller.signal },
  );
  fetchMock.mockRestore();
});

test("serializes a date-bounded backtest request and maps its response", async () => {
  const request: BacktestRequest = {
    fees: 0,
    initial_cash: 10000,
    start_datetime: "2025-01-01T00:00:00",
    end_datetime: "2025-01-02T00:00:00",
    parameters: { fast_window: 10, slow_window: 30 },
    slippage: 0,
    strategy: "sma_cross",
    symbol: "NDX",
    timeframe: "5m",
  };
  const response = {
    symbol: "NDX",
    timeframe: "5m",
    strategy: "sma_cross",
    start_datetime: "2025-01-01T00:00:00",
    end_datetime: "2025-01-02T00:00:00",
    candle_count: 500,
    initial_cash: 10000,
    final_value: 10500,
    total_return: 0.05,
    max_drawdown: 0,
    sharpe_ratio: null,
    total_trades: 0,
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(response), { status: 200 }),
  );

  await expect(submitBacktest(request)).resolves.toEqual(response);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/backtests"), {
    body: JSON.stringify(request),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  fetchMock.mockRestore();
});

test("surfaces the detail from a typed backend error envelope", async () => {
  const request: BacktestRequest = {
    fees: 0,
    initial_cash: 10000,
    start_datetime: "2025-01-01T00:00:00",
    end_datetime: "2025-01-02T00:00:00",
    parameters: {},
    slippage: 0,
    strategy: "sma_cross",
    symbol: "NDX",
    timeframe: "5m",
  };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        type: "invalid_backtest_period",
        title: "Invalid backtest period",
        detail: "start_datetime must be less than or equal to end_datetime",
      }),
      { status: 400 },
    ),
  );

  await expect(submitBacktest(request)).rejects.toThrow(
    "start_datetime must be less than or equal to end_datetime",
  );
  fetchMock.mockRestore();
});

test("falls back to the status message for a malformed error response", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("not-json", { status: 502 }),
  );

  await expect(fetchStrategyDefinitions(new AbortController().signal)).rejects.toThrow(
    "Unable to load backtest strategies (502)",
  );
  fetchMock.mockRestore();
});
