import type { components } from "../../api/generated";
import { CLIENT_EVENT_KIND, reportClientEvent } from "../../observability";

export type BacktestRequest = components["schemas"]["BacktestRequest"];
export type BacktestResponse = components["schemas"]["BacktestResponse"];
export type BacktestPeriod = components["schemas"]["BacktestPeriod"];
export type StrategyDefinition = components["schemas"]["StrategyDefinition"];
export type StrategyParameterDefinition = components["schemas"]["StrategyParameterDefinition"];

interface ApiRequestInit extends RequestInit {
  signal?: AbortSignal;
}

interface ApiErrorEnvelope {
  type: string;
  detail: string;
}

const DEFAULT_API_BASE_URL = "/api";

function isApiErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string" &&
    "detail" in value &&
    typeof value.detail === "string"
  );
}

async function errorMessage(response: Response, unavailableMessage: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    if (isApiErrorEnvelope(payload)) {
      return payload.detail;
    }
  } catch {
    // Use the status fallback when the error body is absent or malformed.
  }
  return `${unavailableMessage} (${response.status})`;
}

async function fetchApiJson<T>(
  path: string,
  init: ApiRequestInit,
  unavailableMessage: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL}${path}`, init);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      reportClientEvent(CLIENT_EVENT_KIND.API_FAILURE, error);
    }
    throw error;
  }
  if (!response.ok) {
    const error = new Error(await errorMessage(response, unavailableMessage));
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

export function fetchStrategyDefinitions(signal: AbortSignal): Promise<StrategyDefinition[]> {
  return fetchApiJson<StrategyDefinition[]>(
    "/backtests/strategies",
    { signal },
    "Unable to load backtest strategies",
  );
}

export function fetchBacktestPeriod(
  symbol: string,
  timeframe: string,
  signal: AbortSignal,
): Promise<BacktestPeriod> {
  const query = new URLSearchParams({ symbol, timeframe });
  return fetchApiJson<BacktestPeriod>(
    `/backtests/period?${query.toString()}`,
    { signal },
    "Unable to load available backtest period",
  );
}

export function submitBacktest(request: BacktestRequest): Promise<BacktestResponse> {
  return fetchApiJson<BacktestResponse>(
    "/backtests",
    {
      body: JSON.stringify(request),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
    "Unable to run backtest",
  );
}
