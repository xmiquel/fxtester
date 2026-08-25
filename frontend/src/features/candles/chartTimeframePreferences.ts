const TIMEFRAME_UNIT = {
  MINUTE: "m",
  HOUR: "h",
  DAY: "d",
  WEEK: "w",
  MONTH: "M",
} as const;

type TimeframeUnit = (typeof TIMEFRAME_UNIT)[keyof typeof TIMEFRAME_UNIT];

const TIMEFRAME_UNIT_ORDER: Record<TimeframeUnit, number> = {
  [TIMEFRAME_UNIT.MINUTE]: 0,
  [TIMEFRAME_UNIT.HOUR]: 1,
  [TIMEFRAME_UNIT.DAY]: 2,
  [TIMEFRAME_UNIT.WEEK]: 3,
  [TIMEFRAME_UNIT.MONTH]: 4,
};
const TIMEFRAME_TOKEN_PATTERN = /^([1-9][0-9]*)([mhdwM])$/;
const STORAGE_VERSION = 1;
const DEFAULT_CHART_ID = "primary";

export interface ChartTimeframePreferences {
  available: string[];
  favorites: string[];
}

interface StoredChartTimeframePreferences {
  version: number;
  available: unknown;
  favorites: unknown;
}

export interface ParsedTimeframe {
  amount: number;
  token: string;
  unit: TimeframeUnit;
}

export const DEFAULT_CHART_TIMEFRAME_PREFERENCES: ChartTimeframePreferences = {
  available: ["1m", "3m", "5m", "15m", "1h", "3h", "4h", "1d"],
  favorites: ["1m", "3m", "5m", "15m", "1h", "3h", "4h", "1d"],
};

export function chartTimeframeStorageKey(chartId: string = DEFAULT_CHART_ID): string {
  return `chart-timeframe-preferences:${chartId}`;
}

export function parseTimeframe(value: unknown): ParsedTimeframe | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = TIMEFRAME_TOKEN_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  return { amount: Number(match[1]), token: value, unit: match[2] as TimeframeUnit };
}

export function compareTimeframes(left: string, right: string): number {
  const leftParsed = parseTimeframe(left);
  const rightParsed = parseTimeframe(right);
  if (leftParsed === null || rightParsed === null) {
    return left.localeCompare(right);
  }
  return (
    TIMEFRAME_UNIT_ORDER[leftParsed.unit] - TIMEFRAME_UNIT_ORDER[rightParsed.unit] ||
    leftParsed.amount - rightParsed.amount ||
    left.localeCompare(right)
  );
}

function uniqueValidTimeframes(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return [...new Set(values.filter((value): value is string => parseTimeframe(value) !== null))].sort(compareTimeframes);
}

function clonePreferences(preferences: ChartTimeframePreferences): ChartTimeframePreferences {
  return { available: [...preferences.available], favorites: [...preferences.favorites] };
}

export function reconcileChartTimeframePreferences(
  preferences: ChartTimeframePreferences,
  catalog: readonly string[] = [],
): ChartTimeframePreferences {
  const available = uniqueValidTimeframes([...preferences.available, ...catalog]);
  const nextAvailable = available.length === 0 ? [...DEFAULT_CHART_TIMEFRAME_PREFERENCES.available] : available;
  const availableSet = new Set(nextAvailable);
  const favorites = uniqueValidTimeframes(preferences.favorites).filter((timeframe) => availableSet.has(timeframe));
  const nextFavorites = favorites.length === 0
    ? DEFAULT_CHART_TIMEFRAME_PREFERENCES.favorites.filter((timeframe) => availableSet.has(timeframe))
    : favorites;
  return { available: nextAvailable, favorites: nextFavorites };
}

export function loadChartTimeframePreferences(chartId: string = DEFAULT_CHART_ID): ChartTimeframePreferences {
  try {
    const raw = localStorage.getItem(chartTimeframeStorageKey(chartId));
    if (raw === null) {
      return clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== STORAGE_VERSION) {
      return clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
    }
    const stored = parsed as StoredChartTimeframePreferences;
    return reconcileChartTimeframePreferences(
      {
        available: uniqueValidTimeframes(stored.available),
        favorites: uniqueValidTimeframes(stored.favorites),
      },
    );
  } catch {
    return clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES);
  }
}

export function persistChartTimeframePreferences(
  chartId: string = DEFAULT_CHART_ID,
  preferences: ChartTimeframePreferences,
): void {
  try {
    const safePreferences = reconcileChartTimeframePreferences(preferences);
    localStorage.setItem(
      chartTimeframeStorageKey(chartId),
      JSON.stringify({ version: STORAGE_VERSION, ...safePreferences }),
    );
  } catch {
    // Browser storage is optional; the in-memory preference state remains authoritative.
  }
}
