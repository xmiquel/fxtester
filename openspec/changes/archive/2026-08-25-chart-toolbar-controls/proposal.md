# Proposal: Chart Toolbar Controls

## Intent

Replace the single native timeframe select with a TradingView-style chart toolbar that makes required intervals discoverable, customizable, and persistent. The first slice serves one chart, while its preference boundary is chart-scoped so future synchronized charts do not overwrite one another. Every seeded choice must load real candles rather than expose a misleading UI option.

## Scope

### In Scope
- Seed and initially favorite exactly `1m`, `3m`, `5m`, `15m`, `1h`, `3h`, `4h`, `1d`.
- Render favorites in case-sensitive unit order `m`, `h`, `d`, `w`, `M`, then numeric ascending period; provide manage, star/unstar, and validated positive-integer custom tokens such as `7m`.
- Persist available/favorite values in browser storage keyed by chart identity, and extend backend candle support for case-sensitive `m`, `h`, `d`, `w`, and `M` values.

### Out of Scope
- Multiple synchronized chart UI or changes to `multiple-synchronized-charts`.
- Server-side user preference storage, authentication, trading actions, or unrelated toolbar controls.
- Client/server timezone conversion: calendar boundaries use DuckDB timestamp values exactly, including the NY/DST broker convention.

## Capabilities

### New Capabilities
- `chart-timeframe-preferences`: Chart-scoped available/favorite timeframe state, management UI, validation, ordering, and browser persistence.

### Modified Capabilities
- `timeframe-selection`: Replace the select-only contract with favorites, management, custom values, and exact unit semantics.
- `candlestick-terminal`: Render and reload candles for the expanded timeframe set.
- `terminal-foundation`: Support valid `d`, `w`, and case-sensitive calendar `M` aggregation and catalog responses.

## Approach

Keep selected symbol/timeframe ownership and the existing React Query symbol/timeframe key in `App`. Add a chart-identity preference module with safe localStorage recovery and deterministic reconciliation with the read-only `/timeframes` catalog. Compose the accessible toolbar in the candle feature. Extend backend parsing and DuckDB aggregation so day/week/month boundaries use stored market timestamps without timezone conversion; add contract and UI coverage for ordering, persistence, custom values, and wrong-case rejection.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `frontend/src/App.tsx`, `features/candles/*`, `styles.css` | Modified/New | Toolbar state, manage UI, persistence, accessibility, styling. |
| `backend/app/features/candles/window.py` | Modified | Case-sensitive parsing, supported catalog, calendar aggregation. |
| `frontend/tests/*`, `backend/tests/*` | Modified | Preference, API, aggregation, and query behavior evidence. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Calendar or `M` semantics are incorrect | High | Preserve DuckDB timestamps exactly and test DST/boundary cases. |
| Malformed storage or inaccessible controls break startup | Med | Validate, deduplicate, recover defaults, and test keyboard/focus paths. |

## Rollback Plan

Revert the proposal’s frontend/backend changes and preference key migration; the prior selector, API catalog, and supported aggregation behavior remain the recovery baseline. Leave the unrelated synchronized-chart change untouched.

## Dependencies

- Existing read-only DuckDB source and candle-window API; no new runtime dependency.

## Success Criteria

- [ ] Required seeded favorites, exact ordering, manage/star actions, custom positive tokens, and chart-scoped persistence work end to end.
- [ ] `d`, `w`, and case-sensitive `M` selections return correct candles using stored NY/DST market timestamps, while invalid or wrong-case tokens are rejected.
- [ ] Existing symbol/timeframe query isolation and unrelated synchronized-chart work remain unchanged.
