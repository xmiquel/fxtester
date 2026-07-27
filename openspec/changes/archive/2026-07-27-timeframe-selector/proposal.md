# Proposal: Timeframe Selector

## Intent

Replace the `1m`-only constraint with a timeframe selector supporting 1m, 5m, 15m, and 1h. Traders need multi-resolution views for position sizing, trend analysis, and signal validation — currently blocked by a hardcoded timeframe.

## Scope

### In Scope
- Backend: multi-timeframe support via on-the-fly `date_bin` aggregation from `dt_ohlc_m1`
- API: `/timeframes` endpoint, `?timeframe=` param on `/candles`
- Frontend: `TimeframeSelector` component, state wiring, dynamic labels
- Delta specs for modified capabilities (`candlestick-terminal`, `terminal-foundation`)
- New spec for `timeframe-selection` capability

### Out of Scope
- Real-time/live feed updates
- Chart zoom, pan, or range selection
- Multiple-symbol comparison
- Watchlist, dark/light theme
- Pre-aggregated tables

## Capabilities

### New Capabilities
- `timeframe-selection`: Timeframe selector UI component and `/timeframes` API endpoint listing available timeframes

### Modified Capabilities
- `candlestick-terminal`: Render any supported timeframe, not only `1m`; cursor semantics change per timeframe granularity
- `terminal-foundation`: Remove "no timeframe selector" constraint; generalize "1m-only" to "multi-timeframe backend aggregation"

## Approach

**Backend** — On-the-fly DuckDB aggregation using `date_bin('INTERVAL', datetime, ...)` on `dt_ohlc_m1`. Each timeframe maps to a DuckDB interval (`1 minute`, `5 minutes`, `15 minutes`, `1 hour`). Replace `SUPPORTED_TIMEFRAME` with `SUPPORTED_TIMEFRAMES: frozenset[str]`. The `CandleRepository.read_window()` accepts a `timeframe` param; the aggregation `SELECT` groups by binned datetime + symbol and applies OHLC reduction (`first(open)`, `max(high)`, `min(low)`, `last(close)`, `sum(tickvol)`, `sum(volume)`). Add a `/timeframes` GET endpoint returning the supported list.

**Frontend** — Add `TimeframeSelector` controlled `<select>` (pattern from `SymbolSelector`). Lift `timeframe` state to `App.tsx`, pass to `CandlestickChart` as prop. React Query cache-key separation handles cursor precision changes across timeframes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/app/features/candles/window.py` | Modified | Multi-timeframe validation, aggregation logic, repository signature |
| `backend/app/routers/candles.py` | Modified | Add `/timeframes` endpoint; accept `?timeframe=` param |
| `backend/tests/features/candles/` | Modified | Test fixtures and mocks for multi-timeframe |
| `frontend/src/api.ts` | Modified | Accept `timeframe` param; add `getTimeframes()` |
| `frontend/src/useCandleWindow.ts` | Modified | Widen `timeframe` type from `"1m"` to `string` |
| `frontend/src/queryKeys.ts` | Modified | Include timeframe in cache key |
| `frontend/src/CandlestickChart.tsx` | Modified | Accept and display timeframe prop |
| `frontend/src/App.tsx` | Modified | Hold timeframe state, wire selector |
| `frontend/src/TimeframeSelector.tsx` | New | Controlled `<select>` for timeframe |
| `openspec/specs/candlestick-terminal/spec.md` | Modified | Delta spec update |
| `openspec/specs/terminal-foundation/spec.md` | Modified | Delta spec update |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `date_bin` aggregation performance on large windows | Low | DuckDB columnar engine handles this efficiently; validate with realistic volumes |
| Cursor precision drift across timeframes | Low | React Query cache-key separation avoids stale cursor reuse |

## Rollback Plan

Revert `SUPPORTED_TIMEFRAME` → `SUPPORTED_TIMEFRAMES` and repository signature changes in `window.py`. Remove `/timeframes` router endpoint. Restore frontend `"1m"` constants in `api.ts`, `useCandleWindow.ts`, `queryKeys.ts`, `CandlestickChart.tsx`, `App.tsx`. Delete `TimeframeSelector.tsx`.

## Dependencies

- DuckDB `date_bin` function (available in DuckDB ≥ 0.8; project already uses DuckDB)
- Only `dt_ohlc_m1` source table — no new ingestion or pre-aggregation

## Success Criteria

- [ ] Backend returns correctly aggregated candles for 1m, 5m, 15m, 1h via `?timeframe=`
- [ ] `/timeframes` returns `["1m", "5m", "15m", "1h"]`
- [ ] Frontend selector switches timeframes with correct axis labels
- [ ] Existing `1m` tests pass without modification
- [ ] Cursor navigation works correctly at each timeframe
