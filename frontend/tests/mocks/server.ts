import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

export const server = setupServer(
  http.get("*/api/symbols", () => HttpResponse.json({ symbols: ["NDX"] })),
  http.get("*/api/timeframes", () => HttpResponse.json(["1m", "5m", "15m", "1h"])),
  http.get("*/api/candles", ({ request }) => {
    const timeframe = new URL(request.url).searchParams.get("timeframe") ?? "1m";
    return HttpResponse.json({
      symbol: "NDX",
      timeframe,
      candles: [],
      next_cursor: null,
      has_more: false,
    });
  }),
  http.post("*/api/client-events", () => new HttpResponse(null, { status: 202 })),
);
