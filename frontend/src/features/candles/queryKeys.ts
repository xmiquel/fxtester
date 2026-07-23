export interface CandleWindowQueryKeyInput {
  symbol: string;
  timeframe: "1m";
  cursor: string | null;
  limit: number;
}

export const symbolCatalogQueryKey = ["symbols"] as const;

export function candleWindowQueryKey({
  symbol,
  timeframe,
  cursor,
  limit,
}: CandleWindowQueryKeyInput) {
  return ["candles", symbol, timeframe, cursor, limit] as const;
}
