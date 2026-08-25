import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { SymbolSelector } from "../../src/features/candles/SymbolSelector";

function renderSelector(overrides: Partial<Parameters<typeof SymbolSelector>[0]> = {}) {
  return render(
    <SymbolSelector
      onSelect={vi.fn()}
      selectedSymbol="AAPL"
      symbols={["AAPL", "BTCUSD", "ETHUSD"]}
      {...overrides}
    />,
  );
}

test("filters by case-insensitive substring and orders deterministic deduplicated results", () => {
  renderSelector({ symbols: ["ethusd", "BTCUSD", "AAPL", "btcusd", "ETHUSD"] });
  fireEvent.click(screen.getByRole("button", { name: "Market symbol" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search market symbols" }), { target: { value: "USD" } });

  expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["BTCUSD", "ETHUSD"]);
});

test("exposes loading, unavailable, and no-match states", () => {
  const { rerender } = renderSelector({ isLoading: true, symbols: undefined });
  fireEvent.click(screen.getByRole("button", { name: "Market symbol" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading market symbols");

  rerender(
    <SymbolSelector
      isError
      onSelect={vi.fn()}
      selectedSymbol="AAPL"
      symbols={undefined}
    />,
  );
  expect(screen.getByRole("status")).toHaveTextContent("unavailable");

  rerender(
    <SymbolSelector onSelect={vi.fn()} selectedSymbol="AAPL" symbols={["AAPL"]} />,
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Search market symbols" }), { target: { value: "zzz" } });
  expect(screen.getByRole("status")).toHaveTextContent("No market symbols match");
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

test("supports keyboard opening, navigation, selection, escape, and focus return", () => {
  const onSelect = vi.fn();
  renderSelector({ onSelect, symbols: ["AAPL", "BTCUSD", "ETHUSD"] });
  const trigger = screen.getByRole("button", { name: "Market symbol" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const input = screen.getByRole("searchbox", { name: "Search market symbols" });
  expect(input).toHaveFocus();

  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(onSelect).toHaveBeenCalledWith("BTCUSD");
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search market symbols" }), { key: "Escape" });
  expect(trigger).toHaveFocus();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("dismisses on outside click or focus without changing the selection", () => {
  const onSelect = vi.fn();
  renderSelector({ onSelect });
  const trigger = screen.getByRole("button", { name: "Market symbol" });
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(onSelect).not.toHaveBeenCalled();

  fireEvent.click(trigger);
  fireEvent.focus(document.body);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
