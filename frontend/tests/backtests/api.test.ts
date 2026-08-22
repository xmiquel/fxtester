import { expect, test, vi } from "vitest";

vi.mock("../../src/observability", () => ({
  CLIENT_EVENT_KIND: { API_FAILURE: "api_failure" },
  reportClientEvent: vi.fn(),
}));

import {
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

test("serializes the existing backtest request contract and maps its response", async () => {
  const request: BacktestRequest = {
    fees: 0,
    initial_cash: 10000,
    limit: 500,
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
