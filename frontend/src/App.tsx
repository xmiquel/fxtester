import { useEffect, useState, type ReactNode } from "react";

import { CandlestickChart } from "./features/candles/CandlestickChart";
import { SymbolSelector } from "./features/candles/SymbolSelector";
import { useSymbols } from "./features/candles/useSymbols";

export function App() {
  const symbolsQuery = useSymbols();
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const symbols = symbolsQuery.data?.symbols;

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
  } else {
    content = (
      <>
        <SymbolSelector onSelect={setSelectedSymbol} selectedSymbol={selectedSymbol} symbols={symbols} />
        <CandlestickChart symbol={selectedSymbol} />
      </>
    );
  }

  return (
    <main className="terminal-shell">
      <header className="terminal-header">
        <div>
          <p className="eyebrow">Market data</p>
          <h1>Trading Terminal</h1>
        </div>
        <p aria-label="Market scope">Selected symbol · 1m</p>
      </header>
      {content}
    </main>
  );
}
