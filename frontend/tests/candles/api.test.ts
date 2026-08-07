import { expect, test, vi } from "vitest";

vi.mock("../../src/observability", () => ({
  CLIENT_EVENT_KIND: { API_FAILURE: "api_failure" },
  reportClientEvent: vi.fn(),
}));

import { fetchCandleWindow, fetchSymbols, fetchTimeframes } from "../../src/features/candles/api";
import { CLIENT_EVENT_KIND, reportClientEvent } from "../../src/observability";

test("forwards the query AbortSignal to fetch", async () => {
  const controller = new AbortController();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({ symbol: "NDX", timeframe: "1m", candles: [], next_cursor: null, has_more: false }),
      { status: 200 },
    ),
  );

  await fetchCandleWindow({ symbol: "NDX", timeframe: "1m", cursor: null, limit: 200, signal: controller.signal });

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/candles?"), { signal: controller.signal });
  fetchMock.mockRestore();
});

test("rejects a duplicate timestamp within one candle response", async () => {
  const controller = new AbortController();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        symbol: "NDX",
        timeframe: "5m",
        candles: [
          { datetime: "2025-01-01T00:00:00" },
          { datetime: "2025-01-01T00:00:00" },
        ],
        next_cursor: null,
        has_more: false,
      }),
      { status: 200 },
    ),
  );

  await expect(
    fetchCandleWindow({ symbol: "NDX", timeframe: "5m", cursor: null, limit: 200, signal: controller.signal }),
  ).rejects.toThrow("Candle response contains duplicate timestamp: 2025-01-01T00:00:00");
  expect(reportClientEvent).toHaveBeenCalledWith(
    CLIENT_EVENT_KIND.API_FAILURE,
    expect.objectContaining({ message: "Candle response contains duplicate timestamp: 2025-01-01T00:00:00" }),
  );
  fetchMock.mockRestore();
});

test("returns the symbol catalog and forwards the query AbortSignal", async () => {
  const controller = new AbortController();
  const catalog = { symbols: ["NDX", "SPX"] };
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(catalog), { status: 200 }),
  );

  await expect(fetchSymbols({ signal: controller.signal })).resolves.toEqual(catalog);

  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/symbols"), { signal: controller.signal });
  fetchMock.mockRestore();
});

test("reports and rejects an unavailable symbol catalog", async () => {
  const controller = new AbortController();
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 503 }));

  await expect(fetchSymbols({ signal: controller.signal })).rejects.toThrow(
    "Unable to load market symbols (503)",
  );
  expect(reportClientEvent).toHaveBeenCalledWith(
    CLIENT_EVENT_KIND.API_FAILURE,
    expect.objectContaining({ message: "Unable to load market symbols (503)" }),
  );
  fetchMock.mockRestore();
});

test("fetches and returns the available timeframes", async () => {
  const controller = new AbortController();
  const timeframes = ["1m", "5m", "15m", "1h"];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(timeframes), { status: 200 }),
  );

  await expect(fetchTimeframes(controller.signal)).resolves.toEqual(timeframes);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/timeframes"), { signal: controller.signal });
  fetchMock.mockRestore();
});

test("reports a transport failure without sending request details", async () => {
  const controller = new AbortController();
  const error = new TypeError("Failed to fetch");
  const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(error);

  await expect(
    fetchCandleWindow({ symbol: "NDX", timeframe: "1m", cursor: null, limit: 200, signal: controller.signal }),
  ).rejects.toThrow("Failed to fetch");

  expect(reportClientEvent).toHaveBeenCalledWith(CLIENT_EVENT_KIND.API_FAILURE, error);
  fetchMock.mockRestore();
});

test("reports a JSON parse failure without sending response content", async () => {
  const controller = new AbortController();
  const error = new SyntaxError("Unexpected token '<'");
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
    json: vi.fn().mockRejectedValue(error),
    ok: true,
  } as unknown as Response);

  await expect(
    fetchCandleWindow({ symbol: "NDX", timeframe: "1m", cursor: null, limit: 200, signal: controller.signal }),
  ).rejects.toThrow("Unexpected token '<'");

  expect(reportClientEvent).toHaveBeenCalledWith(CLIENT_EVENT_KIND.API_FAILURE, error);
  fetchMock.mockRestore();
});
