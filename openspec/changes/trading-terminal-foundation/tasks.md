# Tasks: Trading Terminal Foundation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~3,377-line staged initial-commit base, including Python and Node lockfiles; this focused remediation adds ~17 lines within PR 1 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 backend/container/CI/operations plus minimal Vite placeholder -> PR 2 frontend/chart/typed client |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend slice, official image, quality gates, operations docs, and minimal Vite placeholder | PR 1 | Base = main; staged initial commit is ~3,377 lines including lockfiles; include build/readiness/frontend-placeholder checks and retained security checks |
| 2 | Frontend slice: Vite React 19 chart shell + generated OpenAPI types | PR 2 | Base = main after PR 1 merges; add Vitest/MSW/Playwright coverage |

## Phase 1: Foundation / Workspace

- [x] 1.1 Create `backend/` and `frontend/` roots with minimal app/test folders, plus `backend/pyproject.toml`, `frontend/package.json`, and top-level `docker-compose.yml`.
- [x] 1.2 Add read-only DuckDB mount wiring in `docker-compose.yml` and backend/frontend Dockerfiles under `docker/` with the source path mounted immutable.
- [x] 1.3 Add repo docs for startup and the no-mutation boundary; note the empty workspace and concrete DuckDB source path.

## Phase 2: Backend API / DuckDB Adapter

- [x] 2.1 Write RED pytest cases in `backend/tests/...` for `GET /candles` returning <=200 `NDX` `1m` rows from `dt_ohlc_m1`, preserving source columns and empty-state behavior.
- [x] 2.2 Implement FastAPI hexagonal ports/adapters in `backend/app/features/candles/window.py` and related `backend/app/...` modules for read-only DuckDB queries, cursor paging, and OpenAPI schema.
- [x] 2.3 Add backend quality config in `backend/` for uv, pytest/pytest-cov, Ruff security rules, mypy, and pip-audit; fail on any write-path attempt.

## PR 1 Review Remediation

- [x] R1 Enforce the fixed NDX first-slice symbol boundary with a future selector extension point.
- [x] R2 Add deterministic isolated-DuckDB pagination, validation, ordering, non-overlap, terminal-page, and source no-write tests.
- [x] R3 Return typed service-unavailable responses, log database failures, and make health/readiness database-aware.
- [x] R4 Make `docker compose up --build` start with a minimal Vite scaffold and add a backend healthcheck.
- [x] R5 Add backend/repository CI gates for pytest, Ruff, mypy, pip-audit, and Semgrep CE.
- [x] R6 Document startup, mount diagnosis, readiness, source safety, and rollback/fix-forward.
- [x] R7 Build `docker/backend.Dockerfile` from official `python:3.14-slim`; verify normal CPython 3.14 and a working glibc-compatible DuckDB import.
- [x] R8 Add container build, `/ready` health/readiness, read-only DuckDB mount, and backend pytest verification for `docker-compose.yml`.
- [x] R9 Create/update `.github/workflows/ci.yml` to run pytest with coverage, Ruff security rules, mypy, pip-audit, and Semgrep CE; retain blocking failures and add no Trivy or supply-chain prerequisites.
- [x] R10 Update `docs/operations.md` with public-image rebuild, readiness/test checks, dependency/source-finding response, read-only source diagnosis, and rollback to the last known-good application image.
- [x] R11 Final 4R remediation: verify `/ready` success/failure contracts, run Compose/backend CI against a temporary read-only DuckDB, retain read-only mount evidence, add structured readiness/error logging and monitoring guidance, version image/build identifiers, reconcile stale exploration guidance, and centralize backend source-column/window policies.
- [x] R12 Final independent-review remediation: ignore local databases, dotenv/credential/key files, and CodeGraph output; assert terminal and empty-table API payloads; emit health/readiness success and failure events through Uvicorn; centralize timeframe/window policies; and reconcile PR 1 artifact state.
- [x] R13 Final review remediation: assert public `1m`/200 policies and the `limit=1` boundary without production policy constants; centralize the NDX endpoint/default validation policy; and state that chart rendering/browser paging remain PR 2 work while retaining the eventual behavior requirements.
- [x] R14 Focused runtime remediation: copy the Vite entry document into the frontend image, fail startup when it is absent or empty, and verify the Compose-served placeholder and frontend health in CI.

## Phase 3: Frontend / Chart Shell

- [ ] 3.1 Write RED Vitest/MSW tests in `frontend/tests/...` for market-window query keys, bounded `maxPages`, AbortSignal forwarding, and one-chart empty-state rendering.
- [ ] 3.2 Create `frontend/src/features/candles/queryKeys.ts`, `useCandleWindow.ts`, and `CandlestickChart.tsx` with TanStack Query, local chart state, and navigation-only paging.
- [ ] 3.3 Add generated OpenAPI type output and strict Vite React 19 TS setup with ESLint/formatter, keeping query keys multi-chart-ready without chart-instance identity.

## Phase 4: Verification / Security / Docs

- [ ] 4.1 Add Playwright coverage for initial load, older-window navigation, and no-full-history materialization.
- [ ] 4.2 Add the remaining frontend CI checks (`vitest`, `tsc`, `eslint`, and `playwright`); PR 1 includes only the backend/repository gate.
- [ ] 4.3 Update docs to explain the read-only DuckDB source, 1m-only first slice, 200-candle cap, and backend-only future aggregation.
