import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { ChartToolbar } from "../../src/features/candles/ChartToolbar";
import type { ChartTimeframePreferences } from "../../src/features/candles/chartTimeframePreferences";

const preferences: ChartTimeframePreferences = {
  available: ["15m", "3h", "1w", "2M"],
  favorites: ["15m", "3h"],
};

test("renders accessible favorite buttons with exact selected state", () => {
  render(
    <ChartToolbar
      chartId="primary"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      preferences={preferences}
      selectedTimeframe="3h"
    />,
  );

  expect(screen.getByRole("region", { name: "Chart timeframe toolbar" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "15m timeframe" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "3h timeframe, selected" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Manage timeframes" })).toHaveAttribute("aria-expanded", "false");
});

test("selects a favorite and supports keyboard star toggling", () => {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  render(
    <ChartToolbar
      chartId="primary"
      onChange={onChange}
      onSelect={onSelect}
      preferences={preferences}
      selectedTimeframe="15m"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "3h timeframe" }));
  expect(onSelect).toHaveBeenCalledWith("3h");

  fireEvent.click(screen.getByRole("button", { name: "Manage timeframes" }));
  const star = screen.getByRole("button", { name: "Unfavorite 3h" });
  star.focus();
  fireEvent.keyDown(star, { key: "Enter" });
  fireEvent.keyUp(star, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith({ available: preferences.available, favorites: ["15m"] });
});

test("adds a valid custom token immediately and rejects invalid input", () => {
  const onChange = vi.fn();
  render(
    <ChartToolbar
      chartId="primary"
      onChange={onChange}
      onSelect={vi.fn()}
      preferences={preferences}
      selectedTimeframe="15m"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Manage timeframes" }));
  const input = screen.getByRole("textbox", { name: "Custom timeframe" });
  fireEvent.change(input, { target: { value: "1H" } });
  fireEvent.click(screen.getByRole("button", { name: "Add timeframe" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Enter a positive integer followed by m, h, d, w, or M.");
  expect(onChange).not.toHaveBeenCalled();

  fireEvent.change(input, { target: { value: "7m" } });
  fireEvent.click(screen.getByRole("button", { name: "Add timeframe" }));
  expect(onChange).toHaveBeenLastCalledWith({
    available: ["7m", ...preferences.available],
    favorites: ["7m", ...preferences.favorites],
  });
});

test("returns focus to manage control when the panel closes", () => {
  render(
    <ChartToolbar
      chartId="primary"
      onChange={vi.fn()}
      onSelect={vi.fn()}
      preferences={preferences}
      selectedTimeframe="15m"
    />,
  );

  const manage = screen.getByRole("button", { name: "Manage timeframes" });
  fireEvent.click(manage);
  fireEvent.click(screen.getByRole("button", { name: "Close timeframe management" }));
  expect(document.activeElement).toBe(manage);
});
