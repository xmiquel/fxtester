import { CandlestickChart } from "./features/candles/CandlestickChart";

export function App() {
  return (
    <main className="terminal-shell">
      <header className="terminal-header">
        <div>
          <p className="eyebrow">Market data</p>
          <h1>Trading Terminal</h1>
        </div>
        <p aria-label="Market scope">NDX · 1m</p>
      </header>
      <CandlestickChart />
    </main>
  );
}
