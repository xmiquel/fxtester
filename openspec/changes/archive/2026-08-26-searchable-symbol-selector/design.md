# Design: Searchable Symbol Selector

## Technical Approach

Extend the existing `SymbolSelector` into a controlled trigger/popover, using the already loaded `useSymbols` catalog and no new API. Market Data will compose it inside `ChartToolbar`, immediately before favorite timeframe controls; Backtest will reuse the same component with its existing parent-controlled props. Extend the existing chart-scoped localStorage record to carry the selected symbol while preserving the current candle query inputs and remount behavior.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Selector ownership | `SymbolSelector` owns query text, highlighted result, open state, focus, and dismissal; `selectedSymbol` and `onSelect` remain controlled props. | Move state into `App`; use a third-party combobox. | Keeps the reusable component self-contained, preserves Backtest's parent source of truth, and adds no dependency. |
| Catalog normalization | Derive a case-insensitive, exact-deduplicated display list; choose the lexicographically smallest original spelling for case-folded duplicates, then sort by folded value and original value. | Trust backend ordering; preserve duplicate rows. | Results are deterministic across catalog order, casing ties, and duplicate entries. Filtering uses the same case-folded value with `includes`. |
| Preference migration | Keep `chart-timeframe-preferences:{chartId}`; accept version 1 timeframe-only records and version 2 records with optional `selectedSymbol`. Write version 2 only after safe reconciliation. | New key; invalidate all v1 records. | Preserves existing timeframe preferences and avoids a destructive migration. |
| Toolbar boundary | `ChartToolbar` receives selector props and renders the selector before timeframe groups; `BacktestPage` renders the selector independently. | Make Backtest consume chart preference state. | Explicitly protects the single-chart boundary and prevents Backtest persistence coupling. |

## Data Flow

```text
useSymbols catalog ──→ SymbolSelector (normalize/filter/sort)
        │                         │ onSelect
        └── App selected symbol ──┴──→ chart preference persistence
                                      └──→ CandlestickChart(symbol, timeframe)
Backtest parent state ──→ SymbolSelector ──→ onSelectSymbol callback
```

On startup, App loads timeframe preferences, loads the symbol catalog, and accepts the stored symbol only when it matches a normalized catalog entry; otherwise it selects the first normalized catalog symbol. Symbol changes update App state and persist the reconciled record. `CandlestickChart` continues to receive exact symbol/timeframe props and remount its canvas on either change.

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/features/candles/SymbolSelector.tsx` | Modify | Controlled trigger/popover, filtering, deterministic catalog normalization, keyboard/focus behavior, loading/error/no-match states. |
| `frontend/src/features/candles/ChartToolbar.tsx` | Modify | Accept and render selector props before favorite timeframe controls. |
| `frontend/src/features/candles/chartTimeframePreferences.ts` | Modify | Add selected-symbol field, v1/v2 parsing, catalog validation, safe defaults, and v2 writes. |
| `frontend/src/App.tsx` | Modify | Reconcile stored symbol with the loaded catalog, persist symbol changes, and pass selector through `ChartToolbar`; retain Backtest parent control. |
| `frontend/src/features/backtests/BacktestPage.tsx` | Modify | Use the enhanced selector without reading or writing chart storage. |
| `frontend/tests/candles/SymbolSelector.test.tsx` | Create | Component interaction and accessibility coverage. |
| `frontend/tests/candles/chartTimeframePreferences.test.ts` | Modify | Migration, validation, isolation, and persistence coverage. |
| `frontend/tests/candles/ChartToolbar.test.tsx` | Modify | Placement and controlled composition coverage. |
| `frontend/tests/App.test.tsx` | Modify | Catalog startup, persisted symbol, symbol-change request/reset, and Backtest isolation. |

## Interfaces / Contracts

```ts
interface SymbolSelectorProps {
  symbols: readonly string[] | undefined;
  selectedSymbol: string;
  onSelect: (symbol: string) => void;
  isLoading?: boolean;
  isError?: boolean;
}

interface ChartTimeframePreferences {
  available: string[];
  favorites: string[];
  selectedSymbol?: string;
}
```

The popover trigger is a named button with `aria-expanded`/`aria-controls`; the popup has an accessible label, text input, and result list. Enter/Space opens, typing filters, Arrow Up/Down changes the highlighted result, Enter selects, Escape closes, and outside click/focus dismisses. Focus returns to the trigger after selection or dismissal. Loading and unavailable catalogs expose status text; zero matches expose an explicit no-match status and no selectable result.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Folded substring filtering, duplicate/casing tie ordering, v1/v2 parsing and catalog validation. | Vitest pure-function and localStorage tests. |
| Integration | Toolbar placement, controlled callbacks, focus return, loading/no-match states, App persistence and chart reset. | React Testing Library/Vitest with mocked catalog and queries. |
| E2E | Keyboard selection and single-chart symbol switch. | Existing Playwright application flow; assert no second chart or changed backend contract. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No backend migration or feature flag. Version 1 records remain readable; the next successful chart preference write upgrades them to version 2. Invalid or unavailable stored symbols fall back to the first loaded catalog symbol without blocking startup.

## Open Questions

- [ ] None blocking implementation.
