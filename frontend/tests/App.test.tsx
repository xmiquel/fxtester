import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, expect, test, vi } from "vitest";

import { App } from "../src/App";
import { chartTimeframeStorageKey } from "../src/features/candles/chartTimeframePreferences";
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

beforeEach(() => {
  localStorage.clear();
});

test("selects the first catalog symbol and isolates the next candle request by selected symbol", async () => {
  const candleSymbols: string[] = [];
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["DAX", "SPX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "2m", "5m", "15m", "1h"])),
    http.get("*/api/candles", ({ request }) => {
      const symbol = new URL(request.url).searchParams.get("symbol");
      candleSymbols.push(symbol ?? "");
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol, timeframe: "1m" });
    }),
  );

  renderApp();

  const selector = await screen.findByRole("button", { name: "Market symbol" });
  expect(selector).toHaveTextContent("DAX");
  await screen.findByText("No DAX 1m candles are available.");
  fireEvent.click(selector);
  fireEvent.click(screen.getByRole("option", { name: "SPX" }));
  await screen.findByText("No SPX 1m candles are available.");

  expect(candleSymbols).toEqual(["DAX", "SPX"]);
});

test("restores a valid chart symbol and timeframe preferences without sharing storage", async () => {
  localStorage.setItem(
    chartTimeframeStorageKey("primary-market-data"),
    JSON.stringify({ version: 2, available: ["1m", "5m"], favorites: ["5m"], selectedSymbol: "SPX" }),
  );
  const requests: Array<{ symbol: string; timeframe: string }> = [];
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["DAX", "SPX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "5m"])),
    http.get("*/api/candles", ({ request }) => {
      const url = new URL(request.url);
      requests.push({ symbol: url.searchParams.get("symbol") ?? "", timeframe: url.searchParams.get("timeframe") ?? "" });
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "SPX", timeframe: "1m" });
    }),
  );

  renderApp();

  expect(await screen.findByRole("button", { name: "Market symbol" })).toHaveTextContent("SPX");
  expect(await screen.findByRole("button", { name: "5m timeframe" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "5m timeframe" }));
  await screen.findByText("No SPX 5m candles are available.");
  expect(JSON.parse(localStorage.getItem(chartTimeframeStorageKey("primary-market-data")) ?? "{}")).toMatchObject({
    selectedSymbol: "SPX",
    favorites: ["5m"],
  });
  expect(requests[0]).toEqual({ symbol: "SPX", timeframe: "1m" });
});

test("renders favorite timeframe toolbar and switches timeframe", async () => {
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "2m", "5m", "15m", "1h"])),
    http.get("*/api/candles", ({ request }) => {
      const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "NDX", timeframe });
    }),
  );

  renderApp();

  const timeframeButton = await screen.findByRole("button", { name: "1m timeframe, selected" });
  expect(await screen.findByText("No NDX 1m candles are available.")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "5m timeframe" }));
  expect(await screen.findByText("No NDX 5m candles are available.")).toBeInTheDocument();
  expect(screen.getByText("Selected symbol · 5m")).toBeInTheDocument();
  expect(timeframeButton).toHaveAttribute("aria-pressed", "false");
});

test("switches to an exact custom timeframe token from the keyboard", async () => {
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "2m", "5m", "15m", "1h"])),
    http.get("*/api/candles", ({ request }) => {
      const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "NDX", timeframe });
    }),
  );

  renderApp();

  await screen.findByText("No NDX 1m candles are available.");
  fireEvent.keyDown(window, { key: "3" });
  fireEvent.keyDown(window, { key: "w" });

  expect(await screen.findByText("No NDX 3w candles are available.")).toBeInTheDocument();
  expect(screen.getByText("Selected symbol · 3w")).toBeInTheDocument();
});

test("does not switch timeframe when the management form owns the keyboard event", async () => {
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "2m", "5m", "15m", "1h"])),
    http.get("*/api/candles", ({ request }) => {
      const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "NDX", timeframe });
    }),
  );

  renderApp();

  await screen.findByText("No NDX 1m candles are available.");
  fireEvent.click(screen.getByRole("button", { name: "Manage timeframes" }));
  const customInput = screen.getByRole("textbox", { name: "Custom timeframe" });
  fireEvent.keyDown(customInput, { key: "1" });
  fireEvent.keyDown(customInput, { key: "h" });

  expect(screen.getByText("Selected symbol · 1m")).toBeInTheDocument();
});

test("adds a valid custom favorite and requests its exact token", async () => {
  const requests: string[] = [];
  server.use(
    http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "1d", "1w", "1M"])),
    http.get("*/api/candles", ({ request }) => {
      const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
      requests.push(timeframe);
      return HttpResponse.json({ candles: [], has_more: false, next_cursor: null, symbol: "NDX", timeframe });
    }),
  );

  renderApp();

  await screen.findByText("No NDX 1m candles are available.");
  fireEvent.click(screen.getByRole("button", { name: "Manage timeframes" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Custom timeframe" }), { target: { value: "7m" } });
  fireEvent.click(screen.getByRole("button", { name: "Add timeframe" }));
  fireEvent.click(screen.getByRole("button", { name: "7m timeframe" }));

  await screen.findByText("No NDX 7m candles are available.");
  expect(requests).toContain("7m");
});

test("renders empty and retryable catalog states without requesting candles", async () => {
  let candleRequests = 0;
  let catalogAttempts = 0;
  server.use(
    http.get("*/api/symbols", () => {
      catalogAttempts += 1;
      return catalogAttempts === 1 ? new HttpResponse(null, { status: 503 }) : HttpResponse.json({ symbols: [] });
    }),
    http.get("*/api/timeframes", () => HttpResponse.json(["1m", "2m", "5m", "15m", "1h"])),
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
