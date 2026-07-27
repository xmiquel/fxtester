# Design: Timeframe Selector

## Technical Approach

On-the-fly DuckDB `date_bin` aggregation from `dt_ohlc_m1` — no new tables, no pre-aggregation. Replace `SUPPORTED_TIMEFRAME` with `SUPPORTED_TIMEFRAMES: frozenset`. Add `timeframe` parameter to `read_window()`. Frontend `TimeframeSelector` matching `SymbolSelector` pattern. React Query cache-key separation isolates cursor state per timeframe.

## Architecture Decisions

| Decision | Alternatives | Rationale |
|----------|-------------|-----------|
| On-the-fly aggregation vs pre-aggregated tables | Pre-aggregated tables (5m, 15m, 1h) require ingestion pipeline changes, schema maintenance | Source is 1m DuckDB columnar — `date_bin` GROUP BY on filtered data is fast, zero operational overhead |
| `LAST(... ORDER BY ... DESC)` for close/spread | Unordered `LAST()` | `LAST()` without `ORDER BY` is non-deterministic — source rows have no guaranteed order within a bucket |
| Cursor applied BEFORE `date_bin` | Apply after aggregation | Pre-filter `WHERE datetime < ?` reduces aggregation surface; cursor is the direct source timestamp |
| Controlled `<select>` on timeframe | Tabs, segmented control | Native `<select>` keyboard navigation, matches `SymbolSelector` pattern, scales to any number of timeframes |
| React Query key = `["candles", symbol, timeframe, cursor, limit]` | Shared cursor across timeframes | Each timeframe gets isolated cache + cursor, so switching "1m" → "1h" starts fresh with no stale cursor risk |

## Data Flow

```
App.tsx
  ├── useTimeframes() ─── GET /timeframes ─→ ["1m", "5m", "15m", "1h"]
  ├── useState("1m") ─── selectedTimeframe
  ├── <TimeframeSelector> ─── renders options, onChange → setSelectedTimeframe
  └── <CandlestickChart symbol={s} timeframe={t}>
        └── useCandleWindow({symbol, timeframe}) ─── GET /candles?symbol=...&timeframe=...
              └── CandleWindowService.get_window(timeframe=...)
                    └── DuckDbCandleRepository.read_window(timeframe=...)
                          ├── "1m" → direct SELECT (no aggregation)
                          └── "5m"/"15m"/"1h" → date_bin aggregation SELECT
```

## Data Model Changes

```python
# window.py — constants
SUPPORTED_TIMEFRAMES: frozenset[str] = frozenset({"1m", "5m", "15m", "1h"})
DEFAULT_TIMEFRAME: str = "1m"
TIMEFRAME_INTERVALS: dict[str, str] = {
    "1m": "1 minute", "5m": "5 minutes", "15m": "15 minutes", "1h": "1 hour",
}
```

No migration — single `dt_ohlc_m1` source, aggregation at query time.

## SQL Strategy

**1m path** (no aggregation — same as today):
```sql
SELECT {columns} FROM dt_ohlc_m1
WHERE symbol = ? AND datetime < ?
ORDER BY datetime DESC LIMIT ?
```

**Aggregation path** (5m, 15m, 1h):
```sql
SELECT
  date_bin(INTERVAL '{interval}', datetime, TIMESTAMP 'epoch') AS datetime,
  symbol,
  FIRST(open ORDER BY datetime) AS open,
  MAX(high) AS high, MIN(low) AS low,
  LAST(close ORDER BY datetime) AS close,
  SUM(tickvol) AS tickvol, SUM(volume) AS volume,
  LAST(spread ORDER BY datetime) AS spread,
  LAST(origen ORDER BY datetime) AS origen,
  MAX(fecha_carga) AS fecha_carga
FROM dt_ohlc_m1
WHERE symbol = ? AND datetime < ?
GROUP BY datetime, symbol
ORDER BY datetime DESC LIMIT ?
```

`LAST(col ORDER BY datetime)` ensures deterministic close/spread/origen. DuckDB's `FIRST`/`LAST` accept `ORDER BY` within the aggregate call. The `ORDER BY datetime DESC` produces ascending-time candles when passed through `reversed(rows)` in the existing `read_window()` mapping. The `date_bin(...) AS datetime` alias aligns the aggregated column with `SOURCE_TO_CONTRACT_FIELDS`, which expects `"datetime"` as the source field name — no mapping change needed.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `backend/app/features/candles/window.py` | Modify | `SUPPORTED_TIMEFRAME` → `SUPPORTED_TIMEFRAMES` + `TIMEFRAME_INTERVALS`; add `timeframe` param to `read_window()` protocol; aggregation SQL in `DuckDbCandleRepository`; update `UnsupportedTimeframeError`; `get_window()` validates `in SUPPORTED_TIMEFRAMES`; add `list_timeframes()` |
| `backend/app/main.py` | Modify | Import `SUPPORTED_TIMEFRAMES`; add `GET /timeframes` endpoint; update `/candles` validation |
| `backend/tests/test_candles.py` | Modify | Parametrize timeframe tests; update `test_only_one_minute_timeframe_is_exposed`; test cursor alignment |
| `frontend/src/features/candles/api.ts` | Modify | Widen `timeframe` from `"1m"` literal to `string`; add `fetchTimeframes()` |
| `frontend/src/features/candles/useTimeframes.ts` | Create | React Query hook, pattern from `useSymbols.ts`, fallback on error |
| `frontend/src/features/candles/TimeframeSelector.tsx` | Create | Controlled `<select>` with label, pattern from `SymbolSelector.tsx` |
| `frontend/src/features/candles/useCandleWindow.ts` | Modify | Widen `timeframe` from `"1m"` to `string` |
| `frontend/src/features/candles/queryKeys.ts` | Modify | Widen `timeframe` in `CandleWindowQueryKeyInput` |
| `frontend/src/features/candles/CandlestickChart.tsx` | Modify | Accept `timeframe` prop; dynamic labels; pass to `useCandleWindow` |
| `frontend/src/App.tsx` | Modify | Add `selectedTimeframe` state; use `useTimeframes`; render `TimeframeSelector`; dynamic header label |

## Interfaces / Contracts

### API
```
GET /timeframes → ["1m", "5m", "15m", "1h"]     # new
GET /candles?symbol=X&timeframe=5m&cursor=...    # timeframe param widened; defaults to DEFAULT_TIMEFRAME
```

### Frontend types
```typescript
interface TimeframeSelectorProps {
  timeframes: string[];
  selectedTimeframe: string;
  onSelect: (timeframe: string) => void;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `DuckDbCandleRepository.read_window()` | Parametrized `@pytest.mark.parametrize("timeframe", ["1m","5m","15m","1h"])` — verify correct OHLC, correct bucket count, deterministic close |
| Unit | `CandleWindowService.get_window()` | Invalid timeframe → 400; empty/omitted timeframe → defaults to `DEFAULT_TIMEFRAME` ("1m") |
| Unit | `TimeframeSelector` component | Renders all options, calls `onSelect` on change, accessible label |
| Integration | `/candles?timeframe=` | 200 for each supported timeframe; 400 for `"2m"`; cursor alignment per granularity |
| Integration | `/timeframes` | Returns `["1m","5m","15m","1h"]` sorted alphabetically |
| E2E | Chart renders with timeframe switch | Vitest component test — mount `CandlestickChart` with different `timeframe` props, verify aria-label and heading change |

## Migration / Rollout

No migration. Old `/candles` calls without `timeframe` default to `"1m"` and work identically. Rollback: revert `window.py`, `main.py`, delete `TimeframeSelector.tsx`, `useTimeframes.ts`, restore `"1m"` literals.

## Cursor Semantics

- Cursor filter (`WHERE datetime < ?`) applied BEFORE `date_bin` grouping
- Each timeframe has isolated cursor via React Query cache key `["candles", symbol, timeframe, cursor, limit]`
- On timeframe switch, `cursor` starts at `null` (latest bucket)
- `next_cursor` aligns to last bucket boundary in the window (e.g., for 5m, it's a 5-minute-mark datetime)

## Open Questions

- [x] `reversed(rows)` in `read_window()` currently produces ascending-time candles. For aggregated queries, `ORDER BY datetime DESC` + `reversed()` preserves the ascending contract. The `AS datetime` alias keeps the mapping compatible with `SOURCE_TO_CONTRACT_FIELDS`.
