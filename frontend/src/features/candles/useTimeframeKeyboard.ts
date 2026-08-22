import { useEffect, useRef } from "react";

const TIMEFRAME_INPUT_UNIT = {
  HOURS: "h",
  MINUTES: "m",
} as const;

const TIMEFRAME_INPUT_KEY_PATTERN = /^[0-9mh]$/i;
const TIMEFRAME_INPUT_PREFIX_PATTERN = /^[1-9]\d*[mh]?$/i;
const TIMEFRAME_TOKEN_PATTERN = /^[1-9]\d*[mh]$/i;
const TIMEFRAME_INPUT_TIMEOUT_MS = 1000;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function appendTimeframeInput(currentInput: string, key: string): string {
  const normalizedKey = key.toLowerCase();
  if (!TIMEFRAME_INPUT_KEY_PATTERN.test(normalizedKey)) {
    return currentInput;
  }

  const candidate = `${currentInput}${normalizedKey}`;
  if (TIMEFRAME_INPUT_PREFIX_PATTERN.test(candidate)) {
    return candidate;
  }

  return /^\d$/.test(normalizedKey) ? normalizedKey : "";
}

export function parseTimeframeToken(input: string): string | null {
  const normalizedInput = input.toLowerCase();
  if (!TIMEFRAME_TOKEN_PATTERN.test(normalizedInput)) {
    return null;
  }

  return normalizedInput;
}

export function useTimeframeKeyboard(onSelect: (timeframe: string) => void): void {
  const inputRef = useRef("");
  const onSelectRef = useRef(onSelect);
  const timeoutRef = useRef<number | null>(null);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const clearInput = () => {
      inputRef.current = "";
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const scheduleInputClear = () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(clearInput, TIMEFRAME_INPUT_TIMEOUT_MS);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isEditableTarget(event.target) ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        !TIMEFRAME_INPUT_KEY_PATTERN.test(event.key)
      ) {
        return;
      }

      const nextInput = appendTimeframeInput(inputRef.current, event.key);
      if (nextInput === inputRef.current && nextInput === "") {
        return;
      }

      event.preventDefault();
      inputRef.current = nextInput;
      scheduleInputClear();

      const timeframe = parseTimeframeToken(nextInput);
      if (timeframe !== null) {
        onSelectRef.current(timeframe);
        clearInput();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearInput();
    };
  }, []);
}

export const timeframeKeyboardPolicy = {
  inputUnits: TIMEFRAME_INPUT_UNIT,
  timeoutMs: TIMEFRAME_INPUT_TIMEOUT_MS,
} as const;
