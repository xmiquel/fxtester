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
const STORAGE_VERSION = 2;
const LEGACY_STORAGE_VERSION = 1;
const DEFAULT_CHART_ID = "primary";

export interface ChartTimeframePreferences {
	available: string[];
	favorites: string[];
	selectedSymbol?: string;
}

interface StoredChartTimeframePreferences {
	version: number;
	available: unknown;
	favorites: unknown;
	selectedSymbol?: unknown;
}

export interface NormalizedSymbol {
	original: string;
	folded: string;
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

function compareStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeCatalogSymbols(symbols: readonly string[] | undefined): NormalizedSymbol[] {
	if (!symbols) {
		return [];
	}

	const byFolded = new Map<string, NormalizedSymbol>();
	for (const symbol of symbols) {
		if (typeof symbol !== "string" || symbol.length === 0) {
			continue;
		}
		const folded = symbol.toLocaleLowerCase();
		const current = byFolded.get(folded);
		if (!current || compareStrings(symbol, current.original) < 0) {
			byFolded.set(folded, { folded, original: symbol });
		}
	}

	return [...byFolded.values()].sort(
		(left, right) => compareStrings(left.folded, right.folded) || compareStrings(left.original, right.original),
	);
}

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
	return {
		available: [...preferences.available],
		favorites: [...preferences.favorites],
		...(preferences.selectedSymbol === undefined ? {} : { selectedSymbol: preferences.selectedSymbol }),
	};
}

export function reconcileChartTimeframePreferences(
	preferences: ChartTimeframePreferences,
	catalog: readonly string[] = [],
	symbolCatalog?: readonly string[],
): ChartTimeframePreferences {
  const available = uniqueValidTimeframes([...preferences.available, ...catalog]);
  const nextAvailable = available.length === 0 ? [...DEFAULT_CHART_TIMEFRAME_PREFERENCES.available] : available;
  const availableSet = new Set(nextAvailable);
  const favorites = uniqueValidTimeframes(preferences.favorites).filter((timeframe) => availableSet.has(timeframe));
  const nextFavorites = favorites.length === 0
    ? DEFAULT_CHART_TIMEFRAME_PREFERENCES.favorites.filter((timeframe) => availableSet.has(timeframe))
    : favorites;
	const selectedSymbol =
		symbolCatalog === undefined
			? preferences.selectedSymbol
			: reconcileSelectedSymbol(preferences.selectedSymbol, symbolCatalog);
	return {
		available: nextAvailable,
		favorites: nextFavorites,
		...(selectedSymbol === undefined ? {} : { selectedSymbol }),
	};
}

export function reconcileSelectedSymbol(
	selectedSymbol: string | undefined,
	symbolCatalog: readonly string[],
): string | undefined {
	const normalized = normalizeCatalogSymbols(symbolCatalog);
	if (normalized.length === 0) {
		return undefined;
	}
	const selectedFolded = selectedSymbol?.toLocaleLowerCase();
	return normalized.find((symbol) => symbol.folded === selectedFolded)?.original ?? normalized[0].original;
}

export function loadChartTimeframePreferences(
	chartId: string = DEFAULT_CHART_ID,
	symbolCatalog?: readonly string[],
): ChartTimeframePreferences {
	try {
		const raw = localStorage.getItem(chartTimeframeStorageKey(chartId));
		if (raw === null) {
			return reconcileChartTimeframePreferences(clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES), [], symbolCatalog);
    }
    const parsed: unknown = JSON.parse(raw);
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("version" in parsed) ||
			(parsed.version !== STORAGE_VERSION && parsed.version !== LEGACY_STORAGE_VERSION)
		) {
			return reconcileChartTimeframePreferences(clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES), [], symbolCatalog);
		}
		const stored = parsed as StoredChartTimeframePreferences;
		return reconcileChartTimeframePreferences(
			{
				available: uniqueValidTimeframes(stored.available),
				favorites: uniqueValidTimeframes(stored.favorites),
				...(typeof stored.selectedSymbol === "string" && stored.selectedSymbol.length > 0
					? { selectedSymbol: stored.selectedSymbol }
					: {}),
			},
			[],
			symbolCatalog,
		);
	} catch {
		return reconcileChartTimeframePreferences(clonePreferences(DEFAULT_CHART_TIMEFRAME_PREFERENCES), [], symbolCatalog);
  }
}

export function persistChartTimeframePreferences(
	chartId: string = DEFAULT_CHART_ID,
	preferences: ChartTimeframePreferences,
	symbolCatalog?: readonly string[],
): void {
	try {
		const safePreferences = reconcileChartTimeframePreferences(preferences, [], symbolCatalog);
    localStorage.setItem(
      chartTimeframeStorageKey(chartId),
      JSON.stringify({ version: STORAGE_VERSION, ...safePreferences }),
    );
  } catch {
    // Browser storage is optional; the in-memory preference state remains authoritative.
  }
}
