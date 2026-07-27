# Tasks: Market Context Symbol Selection

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,100 including 220–320 additional compatibility-remediation lines |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Stacked PR 1 backend compatibility remediation; stacked PR 2 frontend selector/cache |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

800-line session budget: keep each implementation session within approximately 800 changed lines and stop at the selected work-unit boundary. The additional remediation remains inside the PR1 boundary.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Backend compatibility remediation and contract | PR 1 | Base `main`; includes runtime/CI/docs corrections, OpenAPI, generated types, and verification. |
| 2 | Frontend selection and state | PR 2 | Base `main` after stacked PR1 merges; includes selector/cache tests and keeps symbol cache isolation. |

## Phase 1: Backend Foundation and Contract

- [x] 1.1 Modify `backend/app/features/candles/window.py` to list distinct non-empty symbols in deterministic order through read-only DuckDB, and validate candle symbols against the fresh catalog while retaining `1m`, cursor paging, and the 200-row cap.
- [x] 1.2 Modify `backend/app/main.py` with typed `SymbolCatalog`, `UnsupportedSymbol`, and `ServiceUnavailable` responses; add `GET /symbols`, documented 400/503 candle/catalog responses, and temporary omitted-symbol-to-NDX compatibility only when fresh discovery contains NDX.
- [x] 1.3 Add backend fixtures/tests in `backend/tests/test_candles.py` for sorting/deduplication/filtering, empty catalog, unavailable database, unsupported symbols, read-only safety, and unchanged 200-row paging.

## Phase 2: OpenAPI and Frontend Core

- [x] 2.1 Export `backend/openapi.json` and regenerate `frontend/src/api/generated.ts` with `npm run generate:api --prefix frontend`; verify schemas and status envelopes match the concrete API.
- [x] 2.2 Extend `frontend/src/features/candles/api.ts` and `queryKeys.ts`, then create `useSymbols.ts` with typed catalog fetching, abort/error handling, bounded retry/cache policy, and symbol-aware candle identity.
- [x] 2.3 Create `SymbolSelector.tsx`; modify `frontend/src/App.tsx` and `CandlestickChart.tsx` to gate candles on catalog readiness, select the deterministic first symbol, remove fixed NDX text, and render accessible loading/error/empty/selection states.

## Phase 3: Verification and Runtime Integration

- [x] 3.1 Extend `frontend/tests/candles/{api,queryKeys,CandlestickChart}.test.ts*` for typed catalog calls, key isolation, symbol transitions, paging reset, and all accessible states; extend `frontend/tests/e2e/terminal.spec.ts` for selection and bounded older-window behavior.
- [x] 3.2 Update `docker-compose.yml` health checks and `README.md` for `/symbols`, selected-symbol startup, explicit empty/unavailable behavior, read-only mount, and preserved 1m/200/no-order boundaries.
- [x] 3.3 Update `.github/workflows/ci.yml` to regenerate/check OpenAPI types and run backend, frontend, and Compose/browser verification; confirm no generated-contract drift or silent NDX fallback.

## Phase 4: Final Review

- [x] 4.1 Run pytest, Ruff, mypy, Vitest, build, Playwright, and Compose checks; inspect the diff for only the listed files and document rollback by reverting the work unit.

## Verified PR 1 Remediation

- [x] R1 Add the discovered non-NDX candle contract test, catalog duration/status logging, and fresh per-symbol authoritative validation without catalog materialization.
- [x] R2 Correct the symbol-required candle OpenAPI contract and the documented 400 error union, then regenerate the checked-in contract/types.
- [x] R3 Make Compose/CI smoke requests catalog-aware and document catalog success, empty, unavailable, recovery, and readiness semantics.

## PR1 Compatibility Remediation (stacked boundary)

The R10/R11 references to a fixed-`NDX` catalog gate describe the temporary PR1
compatibility boundary. They do not override the completed Phase 2 selector work:
the current frontend sends explicitly selected catalog symbols, while the backend
retains omitted-symbol-to-`NDX` compatibility only for legacy callers.

- [x] R4 In `backend/app/main.py` and `backend/app/features/candles/window.py`, make `symbol` optional only for `/candles`; resolve omission from the same fresh catalog to NDX, and never default on missing NDX, empty results, or discovery failure.
- [x] R5 In `backend/app/main.py`, map unresolved/unsupported explicit or omitted symbols to the typed 400 envelope and catalog/database failures to the typed 503 envelope; preserve explicit-symbol validation and existing 1m/200 behavior.
- [x] R6 Regenerate `backend/openapi.json` and `frontend/src/api/generated.ts`; verify optional `symbol`, 400/503 response unions, and generated-contract drift checks match runtime behavior.
- [x] R7 Extend `backend/tests/test_candles.py` with fresh-NDX omission success, omission-without-NDX 400, omission-on-discovery-failure 503, explicit unsupported 400, and unchanged bounded-window cases.
- [x] R8 Correct `docker-compose.yml` health probes so an empty valid catalog remains healthy while unavailable sources fail; add runtime coverage for empty, NDX-compatible, and recovery states.
- [x] R9 Correct `.github/workflows/ci.yml` and `docs/operations.md` smoke commands to seed/check NDX only where required, exercise typed 400/503 paths, validate empty-catalog health, and document the PR1/PR2 boundary.
- [x] R10 At the PR1 boundary, distinguish omitted `symbol` from explicit `symbol=` with typed 400 coverage; add the fixed-NDX catalog gate with accessible empty/error retry states and no candle request for unavailable catalog states; add Compose/CI typed-503 smoke coverage. The selector was deferred only until the completed PR2 work unit.
- [x] R11 At the PR1 boundary, add a deterministic frontend recovery test for a one-time catalog 503 followed by retry, NDX catalog success, and rendered candle request; assert both `/symbols` and `/candles` unavailable-database Compose smoke responses use their typed 503 envelopes. The selector was deferred only until the completed PR2 work unit.
- [x] R12 Add a fresh-catalog regression that changes source symbols between candle requests; name the temporary omitted-symbol compatibility default; strengthen catalog API observable-data/error tests; and consolidate duplicate frontend JSON-fetch error handling without changing the selected-symbol frontend contract.
