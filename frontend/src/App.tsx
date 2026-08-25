import { useEffect, useState, type ReactNode } from "react";

import { BacktestPage } from "./features/backtests/BacktestPage";
import { CandlestickChart } from "./features/candles/CandlestickChart";
import { ChartToolbar } from "./features/candles/ChartToolbar";
import { SymbolSelector } from "./features/candles/SymbolSelector";
import {
  loadChartTimeframePreferences,
  persistChartTimeframePreferences,
  reconcileChartTimeframePreferences,
  type ChartTimeframePreferences,
} from "./features/candles/chartTimeframePreferences";
import { useSymbols } from "./features/candles/useSymbols";
import { useTimeframeKeyboard } from "./features/candles/useTimeframeKeyboard";
import { timeframePolicy, useTimeframes } from "./features/candles/useTimeframes";

const SECTION = {
  BACKTEST: "backtest",
  MARKET_DATA: "market-data",
} as const;

type Section = (typeof SECTION)[keyof typeof SECTION];
const PRIMARY_CHART_ID = "primary-market-data";

export function App() {
  const symbolsQuery = useSymbols();
  const timeframesQuery = useTimeframes();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>("1m");
  const [timeframePreferences, setTimeframePreferences] = useState<ChartTimeframePreferences>(() =>
    loadChartTimeframePreferences(PRIMARY_CHART_ID),
  );
  const [activeSection, setActiveSection] = useState<Section>(SECTION.MARKET_DATA);
  const symbols = symbolsQuery.data?.symbols;
  const timeframes = timeframesQuery.data ?? timeframePolicy.fallback;

  useEffect(() => {
    setTimeframePreferences((current) => {
      const next = reconcileChartTimeframePreferences(current, timeframes);
      persistChartTimeframePreferences(PRIMARY_CHART_ID, next);
      return next;
    });
  }, [timeframes]);

  useTimeframeKeyboard(setSelectedTimeframe);

  useEffect(() => {
    if (symbols && symbols.length > 0) {
      setSelectedSymbol((current) => (current && symbols.includes(current) ? current : symbols[0]));
    }
  }, [symbols]);

  let content: ReactNode;
  if (symbolsQuery.isPending || (symbols && symbols.length > 0 && selectedSymbol === null)) {
    content = <p role="status">Loading market symbols…</p>;
  } else if (symbolsQuery.isError) {
    content = (
      <div role="alert">
        <p>{symbolsQuery.error.message}</p>
        <button onClick={() => void symbolsQuery.refetch()} type="button">
          Retry loading market symbols
        </button>
      </div>
    );
  } else if (!symbols || symbols.length === 0) {
    content = <p role="status">No market symbols are available.</p>;
  } else if (selectedSymbol === null) {
    content = <p role="status">Selecting the first market symbol…</p>;
  } else if (activeSection === SECTION.BACKTEST) {
    content = (
      <BacktestPage
        onSelectSymbol={setSelectedSymbol}
        onSelectTimeframe={setSelectedTimeframe}
        selectedSymbol={selectedSymbol}
        selectedTimeframe={selectedTimeframe}
        symbols={symbols}
        timeframes={timeframes}
      />
    );
  } else {
    content = (
      <>
        <SymbolSelector onSelect={setSelectedSymbol} selectedSymbol={selectedSymbol} symbols={symbols} />
        <ChartToolbar
          chartId={PRIMARY_CHART_ID}
          onChange={(next) => {
            const reconciled = reconcileChartTimeframePreferences(next, timeframes);
            setTimeframePreferences(reconciled);
            persistChartTimeframePreferences(PRIMARY_CHART_ID, reconciled);
          }}
          onSelect={setSelectedTimeframe}
          preferences={timeframePreferences}
          selectedTimeframe={selectedTimeframe}
        />
        <CandlestickChart symbol={selectedSymbol} timeframe={selectedTimeframe} />
      </>
    );
  }

  return (
    <main className="terminal-shell">
      <header className="terminal-header">
        <div>
          <p className="eyebrow">{activeSection === SECTION.BACKTEST ? "Backtest" : "Market data"}</p>
          <h1>Trading Terminal</h1>
        </div>
        <p aria-label="Market scope">Selected symbol · {selectedTimeframe}</p>
      </header>
      <nav aria-label="Terminal sections" className="section-switcher" role="tablist">
        <button
          aria-controls="terminal-section"
          aria-selected={activeSection === SECTION.MARKET_DATA}
          onClick={() => setActiveSection(SECTION.MARKET_DATA)}
          role="tab"
          type="button"
        >
          Market data
        </button>
        <button
          aria-controls="terminal-section"
          aria-selected={activeSection === SECTION.BACKTEST}
          onClick={() => setActiveSection(SECTION.BACKTEST)}
          role="tab"
          type="button"
        >
          Backtest
        </button>
      </nav>
      <div id="terminal-section" role="tabpanel">
        {content}
      </div>
    </main>
  );
}
