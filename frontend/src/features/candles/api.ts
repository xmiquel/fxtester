import type { components } from "../../api/generated";
import { CLIENT_EVENT_KIND, reportClientEvent } from "../../observability";

type CandleWindow = components["schemas"]["CandleWindow"];
type SymbolCatalog = components["schemas"]["SymbolCatalog"];

const DEFAULT_API_BASE_URL = "/api";

interface FetchCandleWindowInput {
  symbol: string;
  timeframe: string;
  cursor: string | null;
  limit: number;
  signal: AbortSignal;
}

interface FetchSymbolsInput {
  signal: AbortSignal;
}

async function fetchApiJson<T>(path: string, signal: AbortSignal, unavailableMessage: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL}${path}`, { signal });
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    }
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`${unavailableMessage} (${response.status})`);
    reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    throw error;
  }
  try {
    return (await response.json()) as T;
  } catch (error) {
    reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    throw error;
  }
}

export function fetchSymbols({ signal }: FetchSymbolsInput): Promise<SymbolCatalog> {
  return fetchApiJson<SymbolCatalog>("/symbols", signal, "Unable to load market symbols");
}

export function fetchTimeframes(signal: AbortSignal): Promise<string[]> {
  return fetchApiJson<string[]>("/timeframes", signal, "Unable to load timeframes");
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

  return fetchApiJson<CandleWindow>(`/candles?${search}`, signal, "Unable to load candles");
}
