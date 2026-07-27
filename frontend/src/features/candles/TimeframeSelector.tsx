interface TimeframeSelectorProps {
  onSelect: (timeframe: string) => void;
  selectedTimeframe: string;
  timeframes: string[];
}

export function TimeframeSelector({ onSelect, selectedTimeframe, timeframes }: TimeframeSelectorProps) {
  return (
    <label htmlFor="timeframe-selector">
      Timeframe
      <select
        aria-label="Timeframe"
        id="timeframe-selector"
        onChange={(event) => onSelect(event.target.value)}
        value={selectedTimeframe}
      >
        {timeframes.map((timeframe) => (
          <option key={timeframe} value={timeframe}>
            {timeframe}
          </option>
        ))}
      </select>
    </label>
  );
}
