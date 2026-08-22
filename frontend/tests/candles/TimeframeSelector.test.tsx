import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { TimeframeSelector } from "../../src/features/candles/TimeframeSelector";

test("includes a custom selected timeframe in the controlled selector", () => {
  render(
    <TimeframeSelector
      onSelect={vi.fn()}
      selectedTimeframe="3h"
      timeframes={["1m", "2m", "5m", "15m", "1h"]}
    />,
  );

  const selector = screen.getByRole("combobox", { name: "Timeframe" });

  expect(selector).toHaveValue("3h");
  expect(screen.getByRole("option", { name: "3h" })).toBeInTheDocument();
});

test("keeps the preset option order when the selection is a preset", () => {
  const onSelect = vi.fn();
  render(
    <TimeframeSelector
      onSelect={onSelect}
      selectedTimeframe="1m"
      timeframes={["1m", "2m", "5m", "15m", "1h"]}
    />,
  );

  fireEvent.change(screen.getByRole("combobox", { name: "Timeframe" }), {
    target: { value: "5m" },
  });

  expect(onSelect).toHaveBeenCalledWith("5m");
});
