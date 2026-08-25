```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:44e865f8b232bde65d27e31d5b2b7d1214fca02ac5413c8a429c85abc7a629ff
verdict: pass
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 20/20
test_command: uv run --directory backend pytest
test_exit_code: 0
test_output_hash: sha256:7233242fd93548ec65a0a684f90a97bb5aca57afa8483f76ae84dfa1a95d4590
build_command: npm run build (frontend)
build_exit_code: 0
build_output_hash: sha256:880ecbdd9c53a49845ffb3554f5ccae00c6b39987e228ad4c53b432d24c85afc
```

## Verification Report

**Change**: chart-toolbar-controls
**Version**: N/A
**Mode**: Standard

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 10 |
| Tasks complete | 10 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ✅ Passed
```text
Command: npm run build (frontend)
Result: TypeScript check and Vite production build passed (exit 0).
The build emitted standard Rollup warnings for ignored React Query "use client" module directives.
```

**Tests**: ✅ Passed
```text
Backend: uv run --directory backend pytest — 101 passed, 1 warning, exit 0.
Frontend: npm test — 91 passed across 11 files, exit 0.
Focused frontend: npm test -- --run tests/App.test.tsx tests/candles/chartTimeframePreferences.test.ts tests/candles/ChartToolbar.test.tsx tests/candles/CandlestickChart.test.tsx tests/backtests/BacktestPage.test.tsx tests/candles/queryKeys.test.ts — 54 passed across 6 files, exit 0.
Focused backend: uv run --directory backend pytest tests/test_candles.py — 75 passed, 1 warning, exit 0.
Playwright: npm run e2e — 8 passed, exit 0.
```

**Coverage**: ➖ Not available; no coverage threshold is configured for this verification run.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| timeframe-selection: API exposes available timeframes | Catalog is requested | `backend/tests/test_candles.py > test_timeframes_endpoint` | ✅ COMPLIANT |
| timeframe-selection: API exposes available timeframes | Unit case is preserved | `backend/tests/test_candles.py > test_timeframes_endpoint` | ✅ COMPLIANT |
| timeframe-selection: Toolbar selects a favorite timeframe | Select favorite | `frontend/tests/App.test.tsx > renders favorite timeframe toolbar and switches timeframe` | ✅ COMPLIANT |
| timeframe-selection: Toolbar selects a favorite timeframe | Manage list | `frontend/tests/candles/ChartToolbar.test.tsx > renders accessible favorite buttons with exact selected state` | ✅ COMPLIANT |
| timeframe-selection: Toolbar is accessible | Keyboard management | `frontend/tests/candles/ChartToolbar.test.tsx > selects a favorite and supports keyboard star toggling` | ✅ COMPLIANT |
| timeframe-selection: Toolbar is accessible | Screen reader state | `frontend/tests/candles/ChartToolbar.test.tsx > renders accessible favorite buttons with exact selected state` | ✅ COMPLIANT |
| timeframe-selection: Timeframe change resets candle pagination | Switch timeframe | `frontend/tests/App.test.tsx > renders favorite timeframe toolbar and switches timeframe`; `frontend/tests/candles/queryKeys.test.ts` | ✅ COMPLIANT |
| terminal-foundation: Multi-timeframe bounded candle slice | Calendar buckets preserve market timestamps | `backend/tests/test_candles.py > test_calendar_timeframes_use_raw_timestamp_boundaries`; `test_calendar_cursor_keeps_raw_wall_clock_without_timezone_conversion` | ✅ COMPLIANT |
| terminal-foundation: Multi-timeframe bounded candle slice | Wrong-case token is rejected | `backend/tests/test_candles.py > test_invalid_timeframe_is_rejected`; `test_custom_timeframe_preserves_case_and_rejects_wrong_case` | ✅ COMPLIANT |
| terminal-foundation: Multi-timeframe bounded candle slice | Cursor remains bounded | `backend/tests/test_candles.py > test_candles_are_bounded_and_preserve_source_columns`; `test_custom_timeframe_cursor_isolated_by_symbol_and_exact_timeframe` | ✅ COMPLIANT |
| terminal-foundation: Expose available timeframes via API | Expanded catalog | `backend/tests/test_candles.py > test_timeframes_endpoint` | ✅ COMPLIANT |
| chart-timeframe-preferences: Seed and order chart timeframes | Initial toolbar | `frontend/tests/candles/chartTimeframePreferences.test.ts > seeds the eight required favorites in deterministic order` | ✅ COMPLIANT |
| chart-timeframe-preferences: Seed and order chart timeframes | Mixed custom ordering | `frontend/tests/candles/chartTimeframePreferences.test.ts > orders case-sensitive units before their numeric period` | ✅ COMPLIANT |
| chart-timeframe-preferences: Manage favorites and custom values | Add valid custom timeframe | `frontend/tests/candles/ChartToolbar.test.tsx > adds a valid custom token immediately and rejects invalid input`; `frontend/tests/e2e/terminal.spec.ts > manages a custom exact token and reloads the market-data chart` | ✅ COMPLIANT |
| chart-timeframe-preferences: Manage favorites and custom values | Reject invalid token | `frontend/tests/candles/chartTimeframePreferences.test.ts > rejects invalid token 0m/-1h/1H/1mm/1.5h/01m`; `ChartToolbar.test.tsx` | ✅ COMPLIANT |
| chart-timeframe-preferences: Persist chart-scoped preferences safely | Restore preferences | `frontend/tests/candles/chartTimeframePreferences.test.ts > persists and restores preferences by chart identity` | ✅ COMPLIANT |
| chart-timeframe-preferences: Persist chart-scoped preferences safely | Malformed or stale storage | `frontend/tests/candles/chartTimeframePreferences.test.ts > reconciles duplicates, stale favorites, catalog values, and a custom value`; `recovers from malformed and unavailable browser storage` | ✅ COMPLIANT |
| candlestick-terminal: Render candle windows at any supported timeframe | Expanded timeframe renders | `frontend/tests/App.test.tsx > adds a valid custom favorite and requests its exact token`; `backend/tests/test_candles.py > test_supported_timeframes_return_200` | ✅ COMPLIANT |
| candlestick-terminal: Render candle windows at any supported timeframe | Timeframe switch reloads | `frontend/tests/e2e/terminal.spec.ts > manages a custom exact token and reloads the market-data chart`; `frontend/tests/App.test.tsx` | ✅ COMPLIANT |
| candlestick-terminal: Render candle windows at any supported timeframe | Empty window | `frontend/tests/candles/CandlestickChart.test.tsx > renders an empty state when the bounded window contains no candles` | ✅ COMPLIANT |

**Compliance summary**: 20/20 scenarios compliant.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Exact case-sensitive timeframe parsing | ✅ Implemented | Frontend and backend accept only positive integer `m`, `h`, `d`, `w`, `M`; wrong-case tokens return typed 400. |
| Raw calendar bucket behavior | ✅ Implemented | DuckDB calendar expressions and cursor normalization preserve raw NY/DST wall-clock timestamps for day, Monday week, and month. |
| Preference ordering, custom values, persistence recovery | ✅ Implemented | Versioned chart-identity storage reconciles valid values, duplicates, stale favorites, malformed JSON, and storage failures. |
| Toolbar accessibility and paths | ✅ Implemented | Named regions, buttons, pressed/current state, keyboard star toggling, labelled form, Escape close, and focus return are covered. |
| Query/chart isolation | ✅ Implemented | Query keys include symbol, exact timeframe, cursor, and limit; chart remount/data revision follows symbol/timeframe. |
| Backtest and unrelated multi-chart preservation | ✅ Implemented | Backtest remains a separate terminal tab/path; synchronized-chart artifacts remain outside the toolbar change scope and existing full suites pass. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Stable chart identity and versioned localStorage | ✅ Yes | App uses `primary-market-data` and `chart-timeframe-preferences:{chartId}`. |
| Case-sensitive parser and deterministic ordering | ✅ Yes | One exact-token parser and `m,h,d,w,M` comparator are used across preference behavior. |
| Raw DuckDB calendar aggregation | ✅ Yes | Calendar units avoid timezone conversion and preserve wall-clock boundaries. |
| App-owned selection and React Query isolation | ✅ Yes | App owns exact selected token; candle query key retains symbol/timeframe/cursor/limit isolation. |
| Accessible toolbar management | ✅ Yes | Toolbar uses labelled semantic controls, keyboard operation, and focus restoration. |

### Preservation Checks
- Backtest page tests passed in the focused and full frontend suites.
- Backend analysis tests passed in the full backend suite.
- No source files under the unrelated synchronized-chart feature were modified by this change; its OpenSpec artifacts remain present.
- No source formatting or repair was performed during verification.

### Issues Found
**CRITICAL**: None.
**WARNING**: Build emits standard non-failing Rollup warnings about ignored React Query module-level `use client` directives; no change-specific failure observed.
**SUGGESTION**: Add a configured coverage threshold or explicit coverage command in a future verification policy if quantitative coverage is required.

### Verdict
PASS WITH WARNINGS
All 10 requirements and 20 scenarios have passing runtime coverage; the only warning is the existing non-failing build diagnostic.
