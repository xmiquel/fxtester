interface SymbolSelectorProps {
  onSelect: (symbol: string) => void;
  selectedSymbol: string;
  symbols: string[];
}

export function SymbolSelector({ onSelect, selectedSymbol, symbols }: SymbolSelectorProps) {
  return (
    <label>
      Market symbol
      <select
        aria-label="Market symbol"
        onChange={(event) => onSelect(event.target.value)}
        value={selectedSymbol}
      >
        {symbols.map((symbol) => (
          <option key={symbol} value={symbol}>
            {symbol}
          </option>
        ))}
      </select>
    </label>
  );
}
