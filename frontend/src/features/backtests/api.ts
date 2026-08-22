import type { components } from "../../api/generated";
import { CLIENT_EVENT_KIND, reportClientEvent } from "../../observability";

export type BacktestRequest = components["schemas"]["BacktestRequest"];
export type BacktestResponse = components["schemas"]["BacktestResponse"];
export type StrategyDefinition = components["schemas"]["StrategyDefinition"];
export type StrategyParameterDefinition = components["schemas"]["StrategyParameterDefinition"];

interface ApiRequestInit extends RequestInit {
  signal?: AbortSignal;
}

const DEFAULT_API_BASE_URL = "/api";

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

export function fetchStrategyDefinitions(signal: AbortSignal): Promise<StrategyDefinition[]> {
  return fetchApiJson<StrategyDefinition[]>(
    "/backtests/strategies",
    { signal },
    "Unable to load backtest strategies",
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
