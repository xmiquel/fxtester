import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";

import { App } from "../src/App";
import { server } from "./mocks/server";

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

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

test("selects the first catalog symbol and isolates the next candle request by selected symbol", async () => {
  const candleSymbols: string[] = [];
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["DAX", "SPX"] })),
    http.get("*/api/candles", ({ request }) => {
      const symbol = new URL(request.url).searchParams.get("symbol");
      candleSymbols.push(symbol ?? "");
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol, timeframe: "1m" });
    }),
  );

  renderApp();

  const selector = await screen.findByRole("combobox", { name: "Market symbol" });
  expect(selector).toHaveValue("DAX");
  await screen.findByText("No DAX 1m candles are available.");
  fireEvent.change(selector, { target: { value: "SPX" } });
  await screen.findByText("No SPX 1m candles are available.");

  expect(candleSymbols).toEqual(["DAX", "SPX"]);
});

test("renders empty and retryable catalog states without requesting candles", async () => {
  let candleRequests = 0;
  let catalogAttempts = 0;
  server.use(
    http.get("*/api/symbols", () => {
      catalogAttempts += 1;
      return catalogAttempts === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ symbols: [] });
    }),
    http.get("*/api/candles", () => {
      candleRequests += 1;
      return HttpResponse.json({});
    }),
  );

  renderApp();

  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load market symbols (503)");
  fireEvent.click(screen.getByRole("button", { name: "Retry loading market symbols" }));
  expect(await screen.findByText("No market symbols are available.")).toBeInTheDocument();
  expect(candleRequests).toBe(0);
});
