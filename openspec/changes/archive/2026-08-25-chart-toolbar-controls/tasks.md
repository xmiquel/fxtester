# Tasks: Chart Toolbar Controls

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 650–900 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 backend contract; PR 2 preference store and toolbar; PR 3 App wiring and end-to-end verification |
| Delivery strategy | exception-ok |
| Chain strategy | size:exception |

Approved exception: Maintainer-approved single large PR under `size:exception`.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size:exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Strict backend tokens and DuckDB calendar buckets | PR 1 | `uv run --directory backend pytest tests/test_candles.py` | `docker compose up --build`; request `/timeframes` and `1d/1w/1M` around NY/DST boundaries | Revert `backend/app/features/candles/window.py` and its backend tests |
| 2 | Persisted preference state and accessible toolbar | PR 2 | `npm test -- --run frontend/tests/candles/chartTimeframePreferences.test.ts frontend/tests/candles/ChartToolbar.test.tsx` | `npm run dev`; keyboard-only manage, star, custom-token, and focus-return flows | Revert new preference/toolbar files and toolbar CSS |
| 3 | App/query integration and terminal reload behavior | PR 3 | `npm test -- --run frontend/tests/App.test.tsx frontend/tests/candles/CandlestickChart.test.tsx` | Playwright terminal scenario switching exact `1m`→`2w` and symbol isolation | Revert `frontend/src/App.tsx`, `useTimeframes.ts`, and integration tests |

## Phase 1: Backend Foundation (PR 1)

- [x] 1.1 RED: Extend `backend/tests/test_candles.py` for catalog, strict `m`/`M` and rejection of `1H`/`1W`, max-1000 pages, and exact symbol/timeframe cursor isolation.
- [x] 1.2 RED: Add DuckDB fixture assertions for raw NY/DST-adjacent `d`, Monday–Sunday `w`, and calendar `M` boundaries with no timezone shift.
- [x] 1.3 GREEN: Modify `backend/app/features/candles/window.py` parser/catalog, cursor handling, and DuckDB bucket SQL to satisfy 1.1–1.2.

## Phase 2: Preference and Toolbar (PR 2)

- [x] 2.1 RED: Create `frontend/tests/candles/chartTimeframePreferences.test.ts` for eight seeds/order, strict token validation, dedupe/stale reconciliation, chart-scoped keys, malformed/storage-failure recovery, and immediate `7m` addition.
- [x] 2.2 GREEN: Create `frontend/src/features/candles/chartTimeframePreferences.ts` with versioned storage, parser, comparator, reconciliation, and safe defaults.
- [x] 2.3 RED: Create `frontend/tests/candles/ChartToolbar.test.tsx` for accessible favorite buttons, `aria-pressed`/selected state, keyboard star/unstar, manage/custom flow, invalid submissions, and focus return.
- [x] 2.4 GREEN: Create `frontend/src/features/candles/ChartToolbar.tsx` and update `frontend/src/styles.css` for responsive, labelled controls.

## Phase 3: Wiring and Verification (PR 3)

- [x] 3.1 RED: Extend `frontend/tests/App.test.tsx` and relevant candle tests for catalog reconciliation, exact token selection, old-candle hiding, fresh query/cursor keys, and symbol isolation.
- [x] 3.2 GREEN: Modify `frontend/src/App.tsx` and `frontend/src/features/candles/useTimeframes.ts` to own stable chart identity/preferences and render the toolbar without touching synchronized charts.
- [x] 3.3 Verify `npm run build`, focused Vitest, backend pytest, and Playwright; confirm empty windows, `1d` rendering, and rollback boundaries.
