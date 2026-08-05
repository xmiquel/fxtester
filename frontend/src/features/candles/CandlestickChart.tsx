import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";
import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

import type { components } from "../../api/generated";
import { useCandleWindow } from "./useCandleWindow";

type Candle = components["schemas"]["Candle"];

function chronologicalUniqueCandles(candles: Candle[]): Candle[] {
  return [...new Map(candles.map((candle) => [candle.datetime, candle])).values()].sort((left, right) =>
    left.datetime.localeCompare(right.datetime),
  );
}

function asChartData(candles: Candle[]): CandlestickData<Time>[] {
  return chronologicalUniqueCandles(candles).map((candle) => ({
      time: Math.floor(new Date(candle.datetime).getTime() / 1000) as Time,
      open: candle.OPEN,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));
}

interface ChartCanvasProps {
  candles: Candle[];
  hasMore: boolean;
  isLoading: boolean;
  onReachStart: () => void;
  symbol: string;
  timeframe: string;
}

const VISIBLE_RANGE_NEAR_START_THRESHOLD = 3;
const CHART_DRAG_DISTANCE_PX = 5;

interface PointerDragStart {
  id: number;
  x: number;
}

function ChartCanvas({ candles, hasMore, isLoading, onReachStart, symbol, timeframe }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerStartXRef = useRef<PointerDragStart | null>(null);
  const hasUserNavigatedRef = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointerStartXRef.current = { id: event.pointerId, x: event.clientX };
  };

  const resetPointerStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerStartXRef.current?.id === event.pointerId) {
      pointerStartXRef.current = null;
    }
  };

  const handlePointerLeave = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
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

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) {
      return;
    }

    const chart = createChart(container, {
      height: 440,
      width: container.clientWidth,
      layout: { background: { type: ColorType.Solid, color: "#101827" }, textColor: "#d8e1ee" },
      grid: { vertLines: { color: "#223047" }, horzLines: { color: "#223047" } },
    });
    const series = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444" });
    series.setData(asChartData(candles));
    chart.timeScale().fitContent();

    const handleVisibleRange = (range: { from: number; to: number } | null) => {
      if (range && hasUserNavigatedRef.current && range.from <= VISIBLE_RANGE_NEAR_START_THRESHOLD && hasMore && !isLoading) {
        hasUserNavigatedRef.current = false;
        onReachStart();
      }
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRange);

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRange);
      chart.remove();
    };
  }, [candles, hasMore, isLoading, onReachStart]);

  return (
    <div
      aria-label={`${symbol} ${timeframe} candlestick chart`}
      className="chart-canvas"
      data-candle-datetimes={chronologicalUniqueCandles(candles).map((candle) => candle.datetime).join(",")}
      data-testid="chart-history"
      onPointerCancelCapture={resetPointerStart}
      onPointerDownCapture={handlePointerDown}
      onPointerLeaveCapture={handlePointerLeave}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={resetPointerStart}
      ref={containerRef}
    />
  );
}

interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
}

export function CandlestickChart({ symbol, timeframe }: CandlestickChartProps) {
  const windowQuery = useCandleWindow({ symbol, timeframe });
  const candles = chronologicalUniqueCandles(windowQuery.data?.pages.flatMap((page) => page.candles) ?? []);

  const handleReachStart = useCallback(() => {
    if (windowQuery.hasNextPage && !windowQuery.isFetchingNextPage) {
      void windowQuery.fetchNextPage();
    }
  }, [windowQuery]);

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
          <p className="eyebrow">Bounded window</p>
          <h2 id="chart-title">{symbol} · {timeframe}</h2>
        </div>
        {windowQuery.isFetchingNextPage && <p role="status">Loading older candles…</p>}
      </div>
      {windowQuery.isFetchNextPageError && (
        <div role="alert">
          <p>{windowQuery.error.message}</p>
          <button onClick={() => void windowQuery.fetchNextPage()} type="button">
            Retry loading older candles
          </button>
        </div>
      )}
      <ChartCanvas
        candles={candles}
        hasMore={windowQuery.hasNextPage}
        isLoading={windowQuery.isFetchingNextPage}
        onReachStart={handleReachStart}
        symbol={symbol}
        timeframe={timeframe}
      />
    </section>
  );
}
