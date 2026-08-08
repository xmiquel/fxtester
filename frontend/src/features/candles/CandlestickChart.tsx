import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import type { components } from "../../api/generated";
import { DataWindow } from "./DataWindow";
import { candleWindowPolicy, useCandleWindow } from "./useCandleWindow";

type Candle = components["schemas"]["Candle"];

const API_DATETIME_TIME_ZONE = "UTC";
const API_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

function chronologicalUniqueCandles(candles: Candle[]): Candle[] {
  return [...new Map(candles.map((candle) => [candle.datetime, candle])).values()].sort((left, right) =>
    left.datetime.localeCompare(right.datetime),
  );
}

function asChartData(candles: Candle[]): CandlestickData<Time>[] {
  return candles.map((candle) => ({
    time: asChartTime(candle),
    open: candle.OPEN,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }));
}

function asChartTime(candle: Candle): Time {
  const match = API_DATETIME_PATTERN.exec(candle.datetime);
  if (match === null) {
    throw new Error(`Candle datetime must be a UTC ISO-8601 timestamp: ${candle.datetime}`);
  }

  const [, year, month, day, hour, minute, second, milliseconds = "0"] = match;
  return Math.floor(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Number(milliseconds.padEnd(3, "0"))) /
      1000,
  ) as Time;
}

function isCandlestickData(data: unknown): data is CandlestickData<Time> {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  return (
    "open" in data &&
    "high" in data &&
    "low" in data &&
    "close" in data &&
    typeof data.open === "number" &&
    typeof data.high === "number" &&
    typeof data.low === "number" &&
    typeof data.close === "number"
  );
}

interface ChartCanvasProps {
  candleDatetimes: string;
  candles: Candle[];
  dataRevision: string;
  hasMore: boolean;
  isLoading: boolean;
  onReachStart: () => void;
  symbol: string;
  timeframe: string;
}

const VISIBLE_RANGE_NEAR_START_THRESHOLD = 1000;
const CHART_DRAG_DISTANCE_PX = 5;

interface PointerDragStart {
  id: number;
  x: number;
}

function ChartCanvas({ candleDatetimes, candles, dataRevision, hasMore, isLoading, onReachStart, symbol, timeframe }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null);
  const seriesRef = useRef<{ setData: (data: CandlestickData<Time>[]) => void } | null>(null);
  const candlesByTimeRef = useRef(new Map<Time, Candle>());
  const previousCandlesRef = useRef<Candle[] | null>(null);
  const orderedCandlesRef = useRef<Candle[]>([]);
  const hasMoreRef = useRef(hasMore);
  const isLoadingRef = useRef(isLoading);
  const onReachStartRef = useRef(onReachStart);
  const paginationRequestInFlightRef = useRef(false);
  const pointerStartXRef = useRef<PointerDragStart | null>(null);
  const hasUserNavigatedRef = useRef(false);
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);
  const orderedCandles = candles;
  const candleDatasetKey =
    orderedCandles.length === 0
      ? `0:${dataRevision}`
      : `${dataRevision}:${orderedCandles.length}:${orderedCandles[0].datetime}:${orderedCandles[orderedCandles.length - 1].datetime}`;
  orderedCandlesRef.current = orderedCandles;
  hasMoreRef.current = hasMore;
  isLoadingRef.current = isLoading;
  onReachStartRef.current = onReachStart;
  const keyboardInstructionsId = "chart-keyboard-instructions";
  const dataWindowId = "candle-data-window";

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartXRef.current = { id: event.pointerId, x: event.clientX };
  };

  const resetPointerStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartXRef.current?.id === event.pointerId) {
      pointerStartXRef.current = null;
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    resetPointerStart(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointerStart = pointerStartXRef.current;
    if (
      pointerStart !== null &&
      pointerStart.id === event.pointerId &&
      Math.abs(event.clientX - pointerStart.x) >= CHART_DRAG_DISTANCE_PX
    ) {
      hasUserNavigatedRef.current = true;
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = hoveredCandle === null ? -1 : orderedCandles.findIndex((candle) => candle.datetime === hoveredCandle.datetime);
    let nextIndex: number | null = null;

    if (event.key === "ArrowLeft") {
      nextIndex = currentIndex === -1 ? orderedCandles.length - 1 : Math.max(0, currentIndex - 1);
    } else if (event.key === "ArrowRight") {
      nextIndex = currentIndex === -1 ? 0 : Math.min(orderedCandles.length - 1, currentIndex + 1);
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = orderedCandles.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setHoveredCandle(orderedCandles[nextIndex]);
    }
  };

  useEffect(() => {
    if (!isLoading) {
      paginationRequestInFlightRef.current = false;
    }
  }, [isLoading]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = createChart(container, {
      height: 440,
      width: container.clientWidth,
      layout: { background: { type: ColorType.Solid, color: "#101827" }, textColor: "#d8e1ee" },
      grid: { vertLines: { color: "#223047" }, horzLines: { color: "#223047" } },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444" });
    chartRef.current = chart;
    seriesRef.current = series;
    previousCandlesRef.current = null;
    candlesByTimeRef.current = new Map();

    const handleCrosshairMove = (param: { point?: { x: number; y: number }; seriesData: Map<unknown, unknown>; time?: Time }) => {
      const seriesData = param.seriesData.get(series);
      const candle = param.time === undefined ? undefined : candlesByTimeRef.current.get(param.time);
      if (param.point === undefined || param.point.x < 0 || param.point.y < 0 || candle === undefined || !isCandlestickData(seriesData)) {
        setHoveredCandle(null);
        return;
      }

      setHoveredCandle(candle);
    };
    chart.subscribeCrosshairMove(handleCrosshairMove);

    const handleVisibleRange = (range: { from: number; to: number } | null) => {
      if (
        range &&
        hasUserNavigatedRef.current &&
        range.from <= VISIBLE_RANGE_NEAR_START_THRESHOLD &&
        hasMoreRef.current &&
        !isLoadingRef.current &&
        !paginationRequestInFlightRef.current
      ) {
        hasUserNavigatedRef.current = false;
        paginationRequestInFlightRef.current = true;
        onReachStartRef.current();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      setHoveredCandle(null);
      chartRef.current = null;
      seriesRef.current = null;
      previousCandlesRef.current = null;
      candlesByTimeRef.current = new Map();
      paginationRequestInFlightRef.current = false;
      pointerStartXRef.current = null;
      hasUserNavigatedRef.current = false;
      window.removeEventListener("resize", resize);
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      chart.remove();
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const nextCandles = orderedCandlesRef.current;
    if (chart === null || series === null || nextCandles.length === 0) {
      return;
    }

    const previousCandles = previousCandlesRef.current;
    const visibleRange = previousCandles === null ? null : chart.timeScale().getVisibleLogicalRange();
    const prependedCount =
      previousCandles === null || previousCandles.length === 0
        ? 0
        : Math.max(0, nextCandles.findIndex((candle) => candle.datetime === previousCandles[0].datetime));

    series.setData(asChartData(nextCandles));
    candlesByTimeRef.current = new Map(nextCandles.map((candle) => [asChartTime(candle), candle]));
    setHoveredCandle((selectedCandle) => {
      if (selectedCandle === null) {
        return null;
      }

      return nextCandles.find((candle) => candle.datetime === selectedCandle.datetime) ?? null;
    });

    if (previousCandles === null) {
      chart.timeScale().fitContent();
    } else if (visibleRange !== null) {
      chart.timeScale().setVisibleLogicalRange({
        from: visibleRange.from + prependedCount,
        to: visibleRange.to + prependedCount,
      });
    }

    previousCandlesRef.current = nextCandles;
    paginationRequestInFlightRef.current = false;
  }, [candleDatasetKey, symbol, timeframe]);

  return (
    <div className="chart-content">
      <p className="visually-hidden" id={keyboardInstructionsId}>
        Use Left and Right Arrow keys to select candles. Press Home for the first candle or End for the last candle. Pointer hover also inspects candles.
      </p>
      <div
        aria-describedby={`${keyboardInstructionsId} ${dataWindowId}`}
        aria-label={`${symbol} ${timeframe} candlestick chart`}
        className="chart-canvas"
        data-candle-datetimes={candleDatetimes}
        data-testid="chart-history"
        onKeyDown={handleKeyDown}
        onPointerCancelCapture={resetPointerStart}
        onPointerDownCapture={handlePointerDown}
        onPointerLeave={handlePointerLeave}
        onPointerMoveCapture={handlePointerMove}
        onPointerUpCapture={resetPointerStart}
        ref={containerRef}
        role="region"
        tabIndex={0}
      />
      <DataWindow candle={hoveredCandle} id={dataWindowId} timeZone={API_DATETIME_TIME_ZONE} />
    </div>
  );
}

interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
}

export function CandlestickChart({ symbol, timeframe }: CandlestickChartProps) {
  const windowQuery = useCandleWindow({ symbol, timeframe });
  const candleDataRevision = `${symbol}:${timeframe}:${windowQuery.dataUpdatedAt}`;
  const pages = windowQuery.data?.pages;
  const candles = chronologicalUniqueCandles(pages?.flatMap((page) => page.candles) ?? []);
  const candleDatetimes = candles.map((candle) => candle.datetime).join(",");
  const retainedCandleCount = windowQuery.data?.pages.reduce((total, page) => total + page.candles.length, 0) ?? 0;
  const lastPage = pages?.[pages.length - 1];
  const retentionCapReached =
    retainedCandleCount >= candleWindowPolicy.maxRetainedCandles ||
    (lastPage?.has_more === true && retainedCandleCount + candleWindowPolicy.limit > candleWindowPolicy.maxRetainedCandles);

  const handleReachStart = () => {
    if (!retentionCapReached && windowQuery.hasNextPage && !windowQuery.isFetchingNextPage) {
      void windowQuery.fetchNextPage();
    }
  };

  if (windowQuery.isPending) {
    return <p role="status">Loading {symbol} {timeframe} candles…</p>;
  }
  if (windowQuery.isError && candles.length === 0) {
    return (
      <div role="alert">
        <p>{windowQuery.error.message}</p>
        <button onClick={() => void windowQuery.refetch()} type="button">
          Retry loading candles
        </button>
      </div>
    );
  }
  if (candles.length === 0) {
    return <p role="status">No {symbol} {timeframe} candles are available.</p>;
  }

  return (
    <section aria-labelledby="chart-title" className="chart-panel">
      <div className="chart-toolbar">
        <div>
          <p className="eyebrow">Loaded history</p>
          <h2 id="chart-title">{symbol} · {timeframe}</h2>
        </div>
        {windowQuery.isFetchingNextPage && <p role="status">Loading older candles…</p>}
        {retentionCapReached && <p role="status">20,000-candle safety limit reached; older history loading stops at the safety limit.</p>}
      </div>
      {windowQuery.isFetchNextPageError && (
        <div role="alert">
          <p>{windowQuery.error.message}</p>
          <button onClick={handleReachStart} type="button">
            Retry loading older candles
          </button>
        </div>
      )}
      <ChartCanvas
        candleDatetimes={candleDatetimes}
        candles={candles}
        dataRevision={candleDataRevision}
        hasMore={!retentionCapReached && windowQuery.hasNextPage}
        isLoading={windowQuery.isFetchingNextPage}
        onReachStart={handleReachStart}
        symbol={symbol}
        timeframe={timeframe}
      />
    </section>
  );
}
