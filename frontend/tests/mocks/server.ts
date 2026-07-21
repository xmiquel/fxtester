import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer(
  http.get("*/api/candles", () =>
    HttpResponse.json({
      symbol: "NDX",
      timeframe: "1m",
      candles: [],
      next_cursor: null,
      has_more: false,
    }),
  ),
  http.post("*/api/client-events", () => new HttpResponse(null, { status: 202 })),
);
