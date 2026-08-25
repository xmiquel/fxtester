# Tasks: Searchable Symbol Selector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–800 authored lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 selector + preferences; PR 2 integration + regression coverage |
| Delivery strategy | exception-ok (maintainer-approved single PR size exception) |
| Chain strategy | not applicable |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: not applicable
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Selector behavior and preference migration | PR 1 | `npm test -- SymbolSelector chartTimeframePreferences` | N/A: pure/component browser behavior covered by Vitest | Revert `SymbolSelector.tsx` and preference module/tests |
| 2 | Market Data/Backtest wiring and regressions | PR 2 | `npm test -- App ChartToolbar` | Existing Playwright single-chart symbol-switch flow; no second chart or contract change | Revert App, toolbar, Backtest wiring/tests |

## Phase 1: Foundation and RED Tests

- [x] 1.1 Add RED tests in `frontend/tests/candles/SymbolSelector.test.tsx` for case-insensitive substring filtering, exact case-folded deduplication/tie ordering, alphabetical results, no-match, loading/error states, keyboard open/filter/Arrow/Enter/Escape, focus return, and outside dismissal.
- [x] 1.2 Add RED tests in `frontend/tests/candles/chartTimeframePreferences.test.ts` for v1 migration, v2 parsing, malformed JSON, invalid/duplicate/stale/incompatible values, catalog symbol reconciliation, safe defaults, writes, and chart A/B isolation.
- [x] 1.3 Add paired RED integration tests in `frontend/tests/candles/ChartToolbar.test.tsx` and `frontend/tests/App.test.tsx` for placement, controlled callbacks, persisted startup symbol, symbol-change reset, timeframe preservation, and unchanged candle request inputs.

## Phase 2: Core Implementation

- [x] 2.1 Extend `SymbolSelector.tsx` with controlled trigger/popover props, normalized deterministic options, accessible list/input, keyboard navigation, focus/dismissal handling, and loading/error/no-match status.
- [x] 2.2 Extend `chartTimeframePreferences.ts` with `selectedSymbol`, version 1/2 safe parsing, catalog validation, reconciliation, per-chart persistence, and backward-compatible defaults.

## Phase 3: Integration and Verification

- [x] 3.1 Update `ChartToolbar.tsx` and `App.tsx` to place the selector before favorite timeframes, reconcile/persist the chart symbol, preserve chart remount behavior, and keep exact timeframe/backend request contracts.
- [x] 3.2 Update `BacktestPage.tsx` to reuse the selector through `onSelectSymbol` while remaining parent-controlled and isolated from chart preference storage; complete focused tests.
- [x] 3.3 Run Vitest suites plus the existing Playwright flow to verify keyboard selection, single-chart switching, loading/empty behavior, no stale candles, no synchronization, and no additional chart.

## Phase 4: Cleanup

- [x] 4.1 Remove the native symbol `<select>` path, confirm no backend/catalog-management changes, and record completed task verification results.

## Apply Evidence

- Focused Vitest: `npm test -- --run tests/candles/SymbolSelector.test.tsx tests/candles/chartTimeframePreferences.test.ts tests/candles/ChartToolbar.test.tsx tests/App.test.tsx tests/backtests/BacktestPage.test.tsx` — passed, 5 files and 39 tests.
- Frontend typecheck/build: `npm run build` — passed; Vite emitted existing dependency `use client` warnings only.
- Frontend lint: `npm run lint` — passed.
- Runtime harness: `npm run e2e` — passed, 9 Playwright tests; selected-symbol request reset to a single chart without a cursor and existing chart/timeframe flows remained green.
- Runtime settlement: `gentle-ai sdd-attempt settle` with the acquired opaque token — completed; native runtime recorded 564 changed lines within the approved 800-line exception budget.
- Rollback boundary: revert the selector, preference migration, toolbar/App/Backtest wiring, styles, and their focused/e2e tests; no backend or catalog files changed.
- Delivery boundary: one maintainer-approved `size:exception` PR containing selector behavior, chart preference migration, Market Data/Backtest integration, and regression coverage.
