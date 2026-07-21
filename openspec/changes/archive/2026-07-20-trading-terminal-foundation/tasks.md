# Tasks: Trading Terminal Foundation

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~6,000-line staged PR 2 delivery, including generated lockfile and archive output; maintainer approved `size:exception` for the focused remediation |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 complete -> PR 2 complete -> focused verification/documentation follow-up |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Backend slice, official image, quality gates, operations docs, and minimal Vite placeholder | PR 1 | Complete; do not reopen scope |
| 2 | Frontend slice: Vite React 19 chart shell + typed client | PR 2 | Complete; follow-up only closes verification/evidence gaps |
| 3 | Reconcile SDD state and close reproducibility/runtime evidence gaps | Follow-up | Base = PR 2; no PR 1 feature changes |
| 4 | Close CRITICAL/BLOCKER review findings without product expansion | PR 2 remediation | Approved `size:exception`; preserve archive evidence honestly |

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

- [x] 3.1 Write RED Vitest/MSW tests in `frontend/tests/...` for market-window query keys, bounded `maxPages`, AbortSignal forwarding, and one-chart empty-state rendering.
- [x] 3.2 Create `frontend/src/features/candles/queryKeys.ts`, `useCandleWindow.ts`, and `CandlestickChart.tsx` with TanStack Query, local chart state, and navigation-only paging.
- [x] 3.3 Add generated OpenAPI type output and strict Vite React 19 TS setup with ESLint/formatter, keeping query keys multi-chart-ready without chart-instance identity.

## Phase 4: Verification / Security / Docs

- [x] 4.1 Add Playwright coverage for initial load, older-window navigation, and no-full-history materialization.
- [x] 4.2 Add the remaining frontend CI checks (`vitest`, `tsc`, `eslint`, and `playwright`); PR 1 includes only the backend/repository gate.
- [x] 4.3 Update docs to explain the read-only DuckDB source, 1m-only first slice, 200-candle cap, and backend-only future aggregation.

## Phase 5: Post-Verify Remediation (PR 2 Follow-up)

- [x] 5.1 Update `proposal.md` and `design.md` so PR 2 completion, generated types, chart delivery, and pagination evidence match the implemented state; retain PR 1 as complete and unchanged.
- [x] 5.2 Add a reproducible OpenAPI export command/script and checked-in source or checksum for `frontend/src/api/generated.ts`; enforce regeneration and drift failure in `.github/workflows/ci.yml`.
- [x] 5.3 Extend `frontend/tests` and `frontend/tests/e2e/terminal.spec.ts` with multiple one-minute candles spanning adjacent pages; assert chronological ordering and duplicate-free merged chart history.
- [x] 5.4 Run Semgrep CE with the repository CI configuration, record the passing command/output in the verification evidence, and fix any blocking findings without adding excluded scanners or prerequisites.
- [x] 5.5 Execute the concrete `docker compose up --build` runtime check against the mounted DuckDB; verify `/ready`, frontend health, read-only mount behavior, and immutable-mount evidence, then document the exact evidence in `docs/operations.md`.

## Phase 6: PR 2 Critical/Blocker Remediation

- [x] 6.1 Exclude frontend dotenv files, local dependencies, coverage, browser output, and local artifacts from the Docker build context; prove excluded sentinels are absent from the built image.
- [x] 6.2 Pin and execute Semgrep reproducibly, then distinguish historical unavailable evidence from the final result in operations and verification records.
- [x] 6.3 Reject focused Vitest and Playwright tests in CI and document invalid candle-parameter 400 responses in FastAPI OpenAPI before regenerating checked-in types.
- [x] 6.4 Add unit/E2E candle-request retry coverage, behavioral three-page next/previous eviction coverage, and Lightweight Charts `setData`/`remove` lifecycle assertions.
- [x] 6.5 Reconcile canonical/archived SDD state and add a reviewer-oriented PR 2 approved-size-exception release summary.

## Phase 7: Final Compose Contract Remediation

- [x] 7.1 Map DuckDB's normalized `open` result field explicitly to the public `OPEN` candle contract, add API regression coverage, and regenerate OpenAPI/frontend types.
- [x] 7.2 Seed the CI temporary read-only DuckDB and assert the proxied Compose `/api/candles` response is HTTP 200 with candle fields; add independently reviewable final Semgrep evidence while preserving the archived historical report.

## Phase 8: Final Resilience and Functional Readiness Remediation

- [x] 8.1 Exercise three-page bounded retention through the production `useCandleWindow` chart path rather than a standalone infinite-query test.
- [x] 8.2 Retain rendered candles after a transient older-window failure, expose an accessible retry action, and cover recovery in Vitest and Playwright.
- [x] 8.3 Add self-hosted client error and API latency observability through structured backend logs, with actionable log monitoring thresholds.
- [x] 8.4 Make Compose readiness include the proxied candle API and add a Playwright check against Compose that proves React renders the seeded API result.
- [x] 8.5 Make CI execute its documented read-only write rejection and source SHA-256 integrity evidence; reconcile operations and release documentation.
- [x] 8.6 Remove the Compose browser check's source-specific timestamp assertion; validate the real proxied candle contract and rendered chart relationship, then record a fresh deterministic fixture, read-only write-rejection, and SHA-256 execution result.

## Phase 9: Final Focused PR 2 Review Remediation

- [x] 9.1 Apply CI-aware Playwright `forbidOnly` protection to the Compose-specific browser configuration, which the CI Compose invocation loads directly.
- [x] 9.2 Add accessible initial-candle retry recovery while retaining the existing non-destructive older-window retry behavior; cover both flows in Vitest and Playwright.
- [x] 9.3 Report transport and JSON parse failures through the existing bounded client observability event without including request URLs or response content; add API-client tests.
- [x] 9.4 Reconcile the PR 2 release summary and final remediation evidence with focused-test enforcement and actual recovery/observability guarantees.

## Phase 10: First-slice observability baseline

- [x] 10.1 Retain self-hosted structured client/API logs, `/health`, `/ready`, and backend/frontend/Compose runtime checks; intentionally exclude Prometheus, Alertmanager, metrics export, alert rules, and alert routing from this slice.
- [x] 10.2 Make retry E2E client-event assertions deterministic and reconcile historical archive and size-exception review wording.
