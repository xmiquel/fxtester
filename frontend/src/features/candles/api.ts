import type { components } from "../../api/generated";
import { CLIENT_EVENT_KIND, reportClientEvent } from "../../observability";

type CandleWindow = components["schemas"]["CandleWindow"];

const DEFAULT_API_BASE_URL = "/api";

interface FetchCandleWindowInput {
  symbol: string;
  timeframe: "1m";
  cursor: string | null;
  limit: number;
  signal: AbortSignal;
}

export async function fetchCandleWindow({
  symbol,
  timeframe,
  cursor,
  limit,
  signal,
}: FetchCandleWindowInput): Promise<CandleWindow> {
  const search = new URLSearchParams({ symbol, timeframe, limit: String(limit) });
  if (cursor) {
    search.set("cursor", cursor);
  }

  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL}/candles?${search}`, {
      signal,
    });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    }
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Unable to load candles (${response.status})`);
    reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    throw error;
  }
  try {
    return (await response.json()) as CandleWindow;
  } catch (error) {
    reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    throw error;
  }
}
