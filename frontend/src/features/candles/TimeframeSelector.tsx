interface TimeframeSelectorProps {
  onSelect: (timeframe: string) => void;
  selectedTimeframe: string;
  timeframes: string[];
}

export function TimeframeSelector({ onSelect, selectedTimeframe, timeframes }: TimeframeSelectorProps) {
  const options = timeframes.includes(selectedTimeframe)
    ? timeframes
    : [selectedTimeframe, ...timeframes];

  return (
    <label htmlFor="timeframe-selector">
      Timeframe
      <select
        aria-label="Timeframe"
        aria-describedby="timeframe-keyboard-instructions"
        id="timeframe-selector"
        onChange={(event) => onSelect(event.target.value)}
        value={selectedTimeframe}
      >
        {options.map((timeframe) => (
          <option key={timeframe} value={timeframe}>
            {timeframe}
          </option>
        ))}
      </select>
      <span className="visually-hidden" id="timeframe-keyboard-instructions">
        Type any positive integer followed by m or h, such as 6m or 3h, to switch. The timeframe is selected after the unit key. Keyboard switching is disabled while typing in a form control.
      </span>
    </label>
  );
}
