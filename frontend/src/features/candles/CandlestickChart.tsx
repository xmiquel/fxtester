import { CandlestickSeries, ColorType, createChart, type CandlestickData, type Time } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

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
  symbol: string;
  timeframe: string;
}

function ChartCanvas({ candles, symbol, timeframe }: ChartCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

    const resize = () => chart.applyOptions({ width: container.clientWidth });
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [candles]);

  return (
    <div
      aria-label={`${symbol} ${timeframe} candlestick chart`}
      className="chart-canvas"
      data-candle-datetimes={chronologicalUniqueCandles(candles).map((candle) => candle.datetime).join(",")}
      data-testid="chart-history"
      ref={containerRef}
    />
  );
}

interface CandlestickChartProps {
  symbol: string;
  timeframe: string;
}

export function CandlestickChart({ symbol, timeframe }: CandlestickChartProps) {
  const [requestedOlderWindow, setRequestedOlderWindow] = useState(false);
  const windowQuery = useCandleWindow({ symbol, timeframe });
  const candles = chronologicalUniqueCandles(windowQuery.data?.pages.flatMap((page) => page.candles) ?? []);

  useEffect(() => {
    setRequestedOlderWindow(false);
  }, [symbol]);

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
        <button
          disabled={!windowQuery.hasNextPage || windowQuery.isFetchingNextPage}
          onClick={() => {
            setRequestedOlderWindow(true);
            void windowQuery.fetchNextPage();
          }}
          type="button"
        >
          {windowQuery.isFetchingNextPage ? "Loading older candles…" : "Load older candles"}
        </button>
      </div>
      {requestedOlderWindow && <p role="status">Older-window navigation is active.</p>}
      {windowQuery.isFetchNextPageError && (
        <div role="alert">
          <p>{windowQuery.error.message}</p>
          <button onClick={() => void windowQuery.fetchNextPage()} type="button">
            Retry loading older candles
          </button>
        </div>
      )}
      <ChartCanvas candles={candles} symbol={symbol} timeframe={timeframe} />
    </section>
  );
}
