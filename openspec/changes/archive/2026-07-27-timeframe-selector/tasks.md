# Tasks: Timeframe Selector

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~350-450 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

## Phase A — Backend Foundation

- [x] A1 — `window.py`: Replace `SUPPORTED_TIMEFRAME` with `SUPPORTED_TIMEFRAMES` (frozenset), `DEFAULT_TIMEFRAME`, `TIMEFRAME_BUCKET_SECONDS`. Update `UnsupportedTimeframeError` message listing all supported values.
- [x] A2 — `window.py`: Add `timeframe: str` param to `CandleRepository.read_window()` protocol. Update `DuckDbCandleRepository.read_window()` with two SQL paths: direct SELECT for `"1m"`, epoch-floor aggregation for `"5m"`/`"15m"`/`"1h"`. Add `list_timeframes()` to both repository and service.
- [x] A3 — `window.py`: Update `CandleWindowService.get_window()` validation to `if timeframe not in SUPPORTED_TIMEFRAMES` and pass `timeframe` to `read_window()`.
- [x] A4 — `main.py`: Import `DEFAULT_TIMEFRAME`. Change `/candles` timeframe default to `DEFAULT_TIMEFRAME`. Add `GET /timeframes` endpoint returning `list_timeframes()`. Add `/timeframes` to logging middleware.
- [x] A5 — `test_candles.py`: Parametrized test for all timeframes (1m, 5m, 15m, 1h) returning 200. Test invalid timeframe (2m) returns 400 with updated error message. Test omitted timeframe defaults to `"1m"`. Test `/timeframes` endpoint. Update `test_only_one_minute_timeframe_is_exposed` and `test_database_failure_is_typed_at_repository_boundary`.

## Phase B — Frontend Type Widen

- [x] B1 — `api.ts`: Change `FetchCandleWindowInput.timeframe` from `"1m"` to `string`. Add `fetchTimeframes(signal)` returning `Promise<string[]>`.
- [x] B2 — `useCandleWindow.ts`: Change `CandleWindowParams.timeframe` to `string`.
- [x] B3 — `queryKeys.ts`: Change `CandleWindowQueryKeyInput.timeframe` to `string`.

## Phase C — New Frontend Components

- [x] C1 — `useTimeframes.ts`: React Query hook following `useSymbols.ts` pattern. Fetch `GET /timeframes`, fallback to `["1m","5m","15m","1h"]` via placeholderData, 5-min stale time.
- [x] C2 — `TimeframeSelector.tsx`: Controlled `<select>` with label "Timeframe", pattern from `SymbolSelector.tsx`. Props: `timeframes`, `selectedTimeframe`, `onSelect`.

## Phase D — Frontend Wiring

- [x] D1 — `CandlestickChart.tsx`: Accept `timeframe: string` prop, remove `TIMEFRAME` constant. Pass `timeframe` to `useCandleWindow()`. Dynamic heading, aria-label, empty state, and loading message.
- [x] D2 — `App.tsx`: Add `selectedTimeframe` state (`useState<string>("1m")`). Add `useTimeframes()` hook. Render `<TimeframeSelector>` alongside `<SymbolSelector>`. Pass `timeframe` to `<CandlestickChart>`. Dynamic header label.

## Phase E — Frontend Tests & E2E

- [x] E1 — `server.ts` (MSW): Add `/timeframes` handler. Make `/candles` handler read `timeframe` from URL params.
- [x] E2 — `api.test.ts`: Add test for `fetchTimeframes` returning timeframes array.
- [x] E3 — `queryKeys.test.ts`: Test already compatible — `timeframe: "1m"` is assignable to widened `string`. No change needed.
- [x] E4 — `CandlestickChart.test.tsx`: Add `timeframe` prop to all renders. Add test for non-default `5m` timeframe with heading/aria-label verification.
- [x] E5 — `App.test.tsx`: Add `/timeframes` handler. Add test for timeframe selector interaction switching `1m → 5m`.
- [x] E6 — `terminal.spec.ts` (Playwright): Add `/timeframes` route to `beforeEach`.
- [x] E7 — `compose.spec.ts` (Playwright): Widen `isCandleWindow()` from `=== "1m"` to `typeof === "string"`.
