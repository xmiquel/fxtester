# Proposal: Searchable Symbol Selector

## Intent

Replace the native symbol `<select>` with a reusable, visually improved selector so users can quickly find symbols in the existing backend catalog. The change improves symbol discovery without expanding the catalog/API contract or introducing multi-chart behavior.

## Scope

### In Scope
- Add an accessible symbol trigger/popover with a case-insensitive substring filter and alphabetically ordered results.
- Place the control before favorite timeframe controls and reuse it in Market Data and Backtest.
- Persist the selected symbol per chart alongside chart timeframe/favorite preferences; preserve existing timeframe behavior.
- Keep Backtest's controlled selection flow compatible; Backtest selection remains parent-controlled and does not implicitly adopt chart storage.

### Out of Scope
- Multi-chart creation, synchronization, timeframe mapping, or missing-candle behavior.
- Symbol catalog management, new backend symbol-list functionality, or backend contract changes.
- Changing the existing `multiple-synchronized-charts` exploration.

## Capabilities

### New Capabilities
- `searchable-symbol-selector`: Accessible reusable symbol filtering and selection across Market Data and Backtest.

### Modified Capabilities
- `chart-timeframe-preferences`: Persist and restore the chart's selected symbol with its existing timeframe/favorite preferences.
- `candlestick-terminal`: Render the new selector in the single-chart toolbar while preserving selected-symbol and timeframe behavior.

## Approach

Extend `SymbolSelector` into a controlled reusable popover component. Derive its displayed options from the already fetched `symbols` catalog, filter with `toLocaleLowerCase().includes(...)`, sort deterministically, and expose keyboard/focus/empty-result states. Integrate chart persistence in `chartTimeframePreferences.ts` with safe versioned storage and graceful fallback; keep Backtest wired through its existing `onSelectSymbol` boundary without coupling it to chart storage. Preserve explicit selected-symbol requests and all backend contracts.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/features/candles/SymbolSelector.tsx` | Modified | Reusable trigger, filter, results, and accessibility behavior. |
| `frontend/src/App.tsx` | Modified | Chart selection and per-chart symbol persistence. |
| `frontend/src/features/candles/chartTimeframePreferences.ts` | Modified | Versioned symbol preference storage alongside timeframe preferences. |
| `frontend/src/features/backtests/BacktestPage.tsx` | Modified | Reuse selector without changing controlled backtest semantics. |
| `frontend/src/features/candles/ChartToolbar.tsx` | Modified | Position selector before favorite timeframe controls. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Popover keyboard/focus behavior regresses usability | Med | Accessible names, focus management, and component tests. |
| Stored data breaks existing preferences | Low | Versioned parsing, backward-safe defaults, and migration tests. |
| Backtest state becomes coupled to chart state | Med | Keep Backtest parent-controlled and test independent flows. |

## Rollback Plan

Revert the selector, integration, and preference-schema changes; restore the native selector and existing timeframe-only storage. No backend or database rollback is required.

## Dependencies

- Existing `/symbols` catalog, React Query symbol loading, current chart preference storage, and frontend test tooling.

## Success Criteria

- [ ] Users can filter the complete current catalog with case-insensitive substring matching and receive alphabetical results.
- [ ] The selector is keyboard-operable, accessible, and appears before favorite timeframe controls in both supported workflows.
- [ ] Reloading a chart restores its selected symbol and existing timeframe/favorite preferences without changing backend requests.
- [ ] Backtest remains controlled by its existing parent flow and no multi-chart behavior is introduced.
