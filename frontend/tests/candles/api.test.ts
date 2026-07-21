import { expect, test, vi } from "vitest";

vi.mock("../../src/observability", () => ({
  CLIENT_EVENT_KIND: { API_FAILURE: "api_failure" },
  reportClientEvent: vi.fn(),
}));

import { fetchCandleWindow } from "../../src/features/candles/api";
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
