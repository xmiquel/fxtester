import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { normalizeCatalogSymbols } from "./chartTimeframePreferences";

export interface SymbolSelectorProps {
  isError?: boolean;
  isLoading?: boolean;
  onSelect: (symbol: string) => void;
  selectedSymbol: string;
  symbols: readonly string[] | undefined;
}

export function SymbolSelector({
  isError = false,
  isLoading = false,
  onSelect,
  selectedSymbol,
  symbols,
}: SymbolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectorId = useId();
  const popoverId = `${selectorId}-popover`;
  const listboxId = `${selectorId}-options`;
  const inputId = `${selectorId}-search`;
  const options = normalizeCatalogSymbols(symbols);
  const filteredOptions = options.filter((option) => option.folded.includes(query.toLocaleLowerCase()));

  const close = () => {
    setIsOpen(false);
    setQuery("");
    setHighlightedIndex(0);
  };

  const open = () => {
    setIsOpen(true);
    setHighlightedIndex(0);
  };

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      return;
    }

    triggerRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const dismissOutside = (event: MouseEvent | FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !containerRef.current?.contains(target)) {
        close();
      }
    };
    document.addEventListener("mousedown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("mousedown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [isOpen]);

  const selectHighlighted = () => {
    const selected = filteredOptions[highlightedIndex];
    if (!selected) {
      return;
    }
    onSelect(selected.original);
    close();
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
    }
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => (filteredOptions.length === 0 ? 0 : (current + 1) % filteredOptions.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) =>
        filteredOptions.length === 0 ? 0 : (current - 1 + filteredOptions.length) % filteredOptions.length,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectHighlighted();
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className="symbol-selector" ref={containerRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label="Market symbol"
        className="symbol-selector-trigger"
        onClick={() => (isOpen ? close() : open())}
        onKeyDown={handleTriggerKeyDown}
        ref={triggerRef}
        type="button"
      >
        <span className="symbol-selector-label">Market symbol</span>
        <span aria-hidden="true">{selectedSymbol || "Unavailable"}</span>
      </button>
      {isOpen && (
        <div
          aria-label="Market symbol selector"
          className="symbol-selector-popover"
          id={popoverId}
          role="dialog"
        >
          <label htmlFor={inputId}>Search market symbols</label>
          <input
            aria-controls={listboxId}
            id={inputId}
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleInputKeyDown}
            ref={inputRef}
            type="search"
            value={query}
          />
          {isLoading && <p role="status">Loading market symbols…</p>}
          {isError && <p role="status">Market symbols are unavailable.</p>}
          {!isLoading && !isError && symbols && filteredOptions.length === 0 && (
            <p role="status">No market symbols match your search.</p>
          )}
          {!isLoading && !isError && filteredOptions.length > 0 && (
            <ul aria-label="Market symbols" className="symbol-selector-options" id={listboxId} role="listbox">
              {filteredOptions.map((option, index) => (
                <li key={option.folded} role="presentation">
                  <button
                    aria-selected={index === highlightedIndex}
                    className={index === highlightedIndex ? "symbol-option highlighted" : "symbol-option"}
                    onClick={() => {
                      onSelect(option.original);
                      close();
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    role="option"
                    type="button"
                  >
                    {option.original}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
