# Proposal: Arbitrary Timeframe Selection

## Intent

Document the implemented extension from fixed presets to TradingView-style arbitrary positive-integer minute/hour selection. Users can type values such as `6m` or `3h` without the selector catalog becoming an exhaustive token list; invalid or incomplete input must leave the current selection unchanged.

## Scope

### In Scope
- Specify keyboard buffering, case-insensitive `^[1-9][0-9]*[mh]$` parsing, timeout, custom selected options, and form-control/modifier boundaries.
- Specify canonical API tokens, dynamic epoch-aligned aggregation, bucket-aligned cursors, pagination, and unchanged `1m` semantics.
- Update the three live capability contracts to reflect the already-implemented behavior.

### Out of Scope
- Application code, tests, endpoint catalog expansion, numeric upper bounds, or future UX improvements.
- Re-opening the archived fixed-preset `timeframe-selector` change; it remains historical context.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `timeframe-selection`: Keyboard accepts arbitrary valid intervals; finite `/timeframes` presets remain discovery options, and custom selected values remain representable.
- `terminal-foundation`: `/candles` accepts arbitrary positive-integer `m`/`h` tokens, aggregates dynamically, canonicalizes tokens, and aligns aggregate cursors.
- `candlestick-terminal`: Rendering, labels, reloads, retained history, and navigation apply to every accepted interval.

## Approach

Create three delta specs that replace stale fixed-preset scenarios rather than append exceptions. Preserve capability boundaries: selector/input in `timeframe-selection`, API/data semantics in `terminal-foundation`, and chart/history behavior in `candlestick-terminal`. Describe the implemented frontend keyboard and controlled-select behavior, backend bucket reduction, and compatibility boundaries.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/{timeframe-selection,terminal-foundation,candlestick-terminal}/spec.md` | Modified | Align live requirements with shipped arbitrary intervals. |
| `frontend/src/features/candles/` | Documented | Keyboard, selector, query propagation, chart reload/history behavior. |
| `backend/app/features/candles/window.py` | Documented | Parsing, aggregation, canonical response, and cursor normalization. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Unbounded integers may produce impractical buckets or numeric/date overflow. | Med | Record current behavior without inventing a limit; defer policy separately. |
| `/timeframes` may be misread as exhaustive. | Med | State the finite-catalog boundary explicitly in selector and API requirements. |

## Rollback Plan

Revert this proposal and its three spec deltas only. No application or test rollback is required because this change documents existing implementation.

## Dependencies

- Existing arbitrary-timeframe implementation and current `dt_ohlc_m1` aggregation path.
- Archived `2026-07-27-timeframe-selector` artifacts as historical baseline only.

## Success Criteria

- [ ] Live specs describe all implemented arbitrary-token, keyboard, selector, API, aggregation, cursor, and chart behaviors.
- [ ] Fixed-preset requirements and invalid-`2h` scenarios are replaced without changing application code or tests.
- [ ] The proposal clearly distinguishes finite quick options from accepted arbitrary intervals.
