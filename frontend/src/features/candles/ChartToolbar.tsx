import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  compareTimeframes,
  parseTimeframe,
  type ChartTimeframePreferences,
} from "./chartTimeframePreferences";

interface ChartToolbarProps {
  chartId: string;
  preferences: ChartTimeframePreferences;
  selectedTimeframe: string;
  onSelect: (token: string) => void;
  onChange: (next: ChartTimeframePreferences) => void;
}

export function ChartToolbar({ chartId, preferences, selectedTimeframe, onSelect, onChange }: ChartToolbarProps) {
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [customTimeframe, setCustomTimeframe] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const manageButtonRef = useRef<HTMLButtonElement>(null);
  const wasManageOpenRef = useRef(false);

  useEffect(() => {
    if (wasManageOpenRef.current && !isManageOpen) {
      manageButtonRef.current?.focus();
    }
    wasManageOpenRef.current = isManageOpen;
  }, [isManageOpen]);

  const closeManagement = () => {
    setValidationError(null);
    setIsManageOpen(false);
  };

  const toggleFavorite = (timeframe: string) => {
    const favorites = preferences.favorites.includes(timeframe)
      ? preferences.favorites.filter((favorite) => favorite !== timeframe)
      : [...preferences.favorites, timeframe].sort(compareTimeframes);
    onChange({ available: [...preferences.available], favorites });
  };

  const addCustomTimeframe = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseTimeframe(customTimeframe);
    if (parsed === null) {
      setValidationError("Enter a positive integer followed by m, h, d, w, or M.");
      return;
    }
    const available = [...new Set([...preferences.available, parsed.token])].sort(compareTimeframes);
    const favorites = [...new Set([...preferences.favorites, parsed.token])].sort(compareTimeframes);
    onChange({ available, favorites });
    setCustomTimeframe("");
    setValidationError(null);
  };

  return (
    <section aria-label="Chart timeframe toolbar" className="timeframe-toolbar" data-chart-id={chartId} role="region">
      <div aria-label="Favorite timeframes" className="timeframe-favorites" role="group">
        {preferences.favorites.map((timeframe) => {
          const selected = timeframe === selectedTimeframe;
          return (
            <button
              aria-current={selected ? "true" : undefined}
              aria-label={`${timeframe} timeframe${selected ? ", selected" : ""}`}
              aria-pressed={selected}
              key={timeframe}
              onClick={() => onSelect(timeframe)}
              type="button"
            >
              {timeframe}
            </button>
          );
        })}
      </div>
      <button
        aria-controls="timeframe-management"
        aria-expanded={isManageOpen}
        aria-label="Manage timeframes"
        className="timeframe-manage-button"
        onClick={() => setIsManageOpen((open) => !open)}
        ref={manageButtonRef}
        type="button"
      >
        Manage
      </button>
      {isManageOpen && (
        <div
          aria-label="Manage timeframes"
          className="timeframe-management"
          id="timeframe-management"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeManagement();
            }
          }}
          role="dialog"
        >
          <div className="timeframe-management-header">
            <h2>Manage timeframes</h2>
            <button aria-label="Close timeframe management" onClick={closeManagement} type="button">
              Close
            </button>
          </div>
          <ul aria-label="Available timeframes" className="timeframe-available-list">
            {[...preferences.available].sort(compareTimeframes).map((timeframe) => {
              const favorite = preferences.favorites.includes(timeframe);
              return (
                <li key={timeframe}>
                  <span>{timeframe}</span>
                  <button
                    aria-pressed={favorite}
                    aria-label={`${favorite ? "Unfavorite" : "Favorite"} ${timeframe}`}
                    onClick={() => toggleFavorite(timeframe)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        toggleFavorite(timeframe);
                      }
                    }}
                    type="button"
                  >
                    {favorite ? "★" : "☆"}
                  </button>
                </li>
              );
            })}
          </ul>
          <form className="custom-timeframe-form" onSubmit={addCustomTimeframe}>
            <label htmlFor="custom-timeframe">Custom timeframe</label>
            <div>
              <input
                aria-describedby={validationError ? "custom-timeframe-error" : undefined}
                id="custom-timeframe"
                onChange={(event) => setCustomTimeframe(event.target.value)}
                value={customTimeframe}
              />
              <button type="submit">Add timeframe</button>
            </div>
            {validationError && <p id="custom-timeframe-error" role="alert">{validationError}</p>}
          </form>
        </div>
      )}
    </section>
  );
}
