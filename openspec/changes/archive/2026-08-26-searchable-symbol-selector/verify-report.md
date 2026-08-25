```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:5a8b5ab18fcd0ddb370ba04d0c859a9e5a1c1024d95447b96097a7d895c0ab78
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 2/2
scenarios: 6/6
test_command: npm test
test_exit_code: 0
test_output_hash: sha256:c14658fdeea05d9a06175b6f3e9b4de26dc6285480f4fb632b2dd5998d1ddaeb
build_command: npm run build
build_exit_code: 0
build_output_hash: sha256:1dbaf1c2a0d0947d169597b9a5c67b75e2851d98f737edbdd7b410503d3ae4a8
```

## Verification Report

**Change**: searchable-symbol-selector
**Version**: N/A
**Mode**: Standard

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 9 |
| Tasks complete | 9 |
| Tasks incomplete | 0 |
| Implementation scope | Approved single-PR `exception-ok`; 564 changed lines within 800-line exception |

### Build & Tests Execution
**Focused tests**: ✅ 39 passed in 5 files
```text
npm test -- --run tests/candles/SymbolSelector.test.tsx tests/candles/chartTimeframePreferences.test.ts tests/candles/ChartToolbar.test.tsx tests/App.test.tsx tests/backtests/BacktestPage.test.tsx
exit_code=0
output_hash=sha256:e22801fcdf973dcfe4c11bb8a1735aa75447cfadfaa11f4f29546fc65220da14
```

**Full frontend tests**: ✅ 101 passed in 12 files
```text
npm test
exit_code=0
output_hash=sha256:c14658fdeea05d9a06175b6f3e9b4de26dc6285480f4fb632b2dd5998d1ddaeb
```

**Build/typecheck**: ✅ Passed
```text
npm run build
exit_code=0
output_hash=sha256:1dbaf1c2a0d0947d169597b9a5c67b75e2851d98f737edbdd7b410503d3ae4a8
```
The build emitted only existing Vite dependency `use client` warnings.

**Lint**: ✅ Passed
```text
npm run lint
exit_code=0
output_hash=sha256:4bb91d2730885464c95b13e5bc7587be57a7a78035aa6fd7e08e1f0bdf74ec74
```

**Runtime / Playwright**: ✅ 9 passed
```text
npm run e2e
exit_code=0
output_hash=sha256:3914e9d857ec1844ab5f65cb9a74d9c618d9771053d2e9c1089571242c3e5f0e
```
The runtime flow covered catalog symbol switching, request reset without a cursor, and single-chart behavior.

**Coverage**: Not separately available; required unit, integration, and E2E checks passed.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Persist chart-scoped preferences safely | Restore preferences | `frontend/tests/candles/chartTimeframePreferences.test.ts > persists and restores preferences by chart identity`; `frontend/tests/App.test.tsx > restores a valid chart symbol and timeframe preferences without sharing storage` | ✅ COMPLIANT |
| Persist chart-scoped preferences safely | Chart isolation | `frontend/tests/candles/chartTimeframePreferences.test.ts > falls back to the first normalized catalog symbol and preserves chart isolation`; `frontend/tests/backtests/BacktestPage.test.tsx > keeps Backtest symbol selection parent-controlled without changing chart preferences` | ✅ COMPLIANT |
| Persist chart-scoped preferences safely | Malformed or incompatible storage | `frontend/tests/candles/chartTimeframePreferences.test.ts > reads v1 records and safely reconciles invalid v2 symbol values`; `frontend/tests/candles/chartTimeframePreferences.test.ts > recovers from malformed and unavailable browser storage` | ✅ COMPLIANT |
| Render the single-chart symbol selector | Toolbar placement and selection | `frontend/tests/candles/ChartToolbar.test.tsx > places the symbol selector before favorite timeframe controls`; `frontend/tests/App.test.tsx > selects the first catalog symbol and isolates the next candle request by selected symbol` | ✅ COMPLIANT |
| Render the single-chart symbol selector | Symbol change resets the active view | `frontend/tests/e2e/terminal.spec.ts > selects a catalog symbol and resets candle requests to that symbol`; `frontend/tests/App.test.tsx > selects the first catalog symbol and isolates the next candle request by selected symbol` | ✅ COMPLIANT |
| Render the single-chart symbol selector | Scope remains single-chart | `frontend/tests/e2e/terminal.spec.ts > selects a catalog symbol and resets candle requests to that symbol`; runtime passed with no second chart, synchronization, timeframe mapping, or backend contract change | ✅ COMPLIANT |

**Compliance summary**: 6/6 scenarios compliant.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|-----------|-------|
| Search and select catalog symbols | ✅ Implemented | Controlled trigger/popover uses the existing catalog, case-insensitive substring matching, folded exact deduplication, deterministic alphabetical ordering, and explicit loading/error/no-match states. |
| Persist chart-scoped preferences safely | ✅ Implemented | Version 1 and version 2 records are accepted; malformed, invalid, duplicate, stale, incompatible, unavailable-storage, and cross-chart cases use safe reconciliation and isolated keys. |
| Render the single-chart symbol selector | ✅ Implemented | Market Data composes the selector before favorite timeframes; selected symbol remains an explicit candle request input and remount/reset behavior is preserved. |
| Backtest remains parent-controlled | ✅ Implemented | Backtest reuses the selector through `onSelectSymbol`; it does not read or write chart preference storage. |
| Scope boundaries | ✅ Implemented | No multi-chart, synchronization, timeframe mapping, missing-candle behavior, catalog management, or backend/API contract additions were found in the approved change evidence. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Selector ownership | ✅ Yes | `SymbolSelector` owns query, open/highlight, focus, and dismissal state; selected symbol and callback remain controlled props. |
| Catalog normalization | ✅ Yes | Folded duplicates choose the lexicographically smallest original spelling, then sort by folded/original values. |
| Preference migration | ✅ Yes | Existing chart preference key is retained; v1 is readable and v2 writes carry selected symbol after reconciliation. |
| Toolbar boundary | ✅ Yes | `ChartToolbar` receives selector props and renders it before timeframe groups; Backtest remains independently parent-controlled. |

### Issues Found
**CRITICAL**: None.

**WARNING**:
1. The build reports existing third-party `use client` bundle warnings; build still exits 0.
2. The approved single-PR size exception remains above the default 400-line review budget, although the recorded 564 changed lines are within the approved 800-line limit.

**SUGGESTION**: Add a dedicated E2E assertion for Backtest symbol switching if future coverage needs to prove that interaction through the browser rather than the existing Vitest integration test.

### Verdict
PASS WITH WARNINGS
All 2 requirements and 6 scenarios have passing runtime coverage; focused/full frontend verification, build/typecheck, lint, and Playwright checks passed.
