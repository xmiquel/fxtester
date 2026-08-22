import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import {
  appendTimeframeInput,
  parseTimeframeToken,
  useTimeframeKeyboard,
} from "../../src/features/candles/useTimeframeKeyboard";

interface KeyboardHarnessProps {
  onSelect: (timeframe: string) => void;
}

function KeyboardHarness({ onSelect }: KeyboardHarnessProps) {
  useTimeframeKeyboard(onSelect);
  return <input aria-label="Search" />;
}

test.each([
  ["", "1", "1"],
  ["1", "m", "1m"],
  ["1", "h", "1h"],
  ["1m", "2", "2"],
  ["1m", "x", "1m"],
])("builds timeframe input safely from %s + %s", (current, key, expected) => {
  expect(appendTimeframeInput(current, key)).toBe(expected);
});

test.each([
  ["1m", "1m"],
  ["2m", "2m"],
  ["1h", "1h"],
  ["3h", "3h"],
  ["6M", "6m"],
  ["0m", null],
  ["1.5h", null],
  ["-1m", null],
  ["1d", null],
  ["1", null],
])("parses timeframe token %s", (input, expected) => {
  expect(parseTimeframeToken(input)).toBe(expected);
});

test.each([
  ["3", "h", "3h"],
  ["6", "m", "6m"],
])("selects an arbitrary timeframe after typing %s%s", (number, unit, expected) => {
  const onSelect = vi.fn();
  render(<KeyboardHarness onSelect={onSelect} />);

  fireEvent.keyDown(window, { key: number });
  fireEvent.keyDown(window, { key: unit });

  expect(onSelect).toHaveBeenCalledOnce();
  expect(onSelect).toHaveBeenCalledWith(expected);
});

test("does not select a timeframe while typing in a form control", () => {
  const onSelect = vi.fn();
  render(<KeyboardHarness onSelect={onSelect} />);
  const input = screen.getByRole("textbox", { name: "Search" });

  fireEvent.keyDown(input, { key: "1" });
  fireEvent.keyDown(input, { key: "h" });

  expect(onSelect).not.toHaveBeenCalled();
});
