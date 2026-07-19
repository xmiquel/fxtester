# Proposal: Trading Terminal Foundation

## Intent

Create a read-only trading terminal around DuckDB with a bounded server-side candle window. The first slice is `1m`, not an architectural limit.

## Scope

### In Scope
- Establish `backend/` (FastAPI + DuckDB) and `frontend/` (Vite + React 19 + strict TypeScript).
- Define OpenAPI-first contracts with generated frontend types.
- Query `market.duckdb` → `dt_ohlc_m1` for NDX `1m` history with cursor/window pagination.
- Enforce the 200-candle response contract in DuckDB.
- Keep timeframe selection and aggregation backend-only.
- Use official `python:3.14-slim` and retain pytest, pytest-cov, Ruff security rules, mypy, pip-audit, and Semgrep CE.

### Out of Scope
- Ingestion, writes, validation, watchlists, indicators, auth, live feeds, multi-user concerns, trading, and broker execution.
- Frontend timeframe aggregation/query shaping or raising the 200-window cap.
- DHI, registry/digest prerequisites, attestations, temporary CVE exceptions, and Trivy.

## Capabilities

### New Capabilities
- `terminal-foundation`: Read-only DuckDB-backed NDX candles, bounded to 200 rows per request.
- `candlestick-terminal`: Backend cursor-window navigation; additional history loads only on user navigation.

### Modified Capabilities
- None.

## Approach

Use a monorepo workspace with the backend as system of record. Mount DuckDB read-only; let it filter, order, and limit results. Expose FastAPI OpenAPI, generate TypeScript types, and keep timeframe work backend-only. Build on official `python:3.14-slim`; enforce retained checks without DHI or Trivy.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/` | New | FastAPI app, DuckDB adapter, tests, typing, audits, and Semgrep |
| `frontend/` | New | Vite React terminal UI and chart wrapper |
| `docker-compose.yml` / `docker/` | New | API, web, and read-only database topology |
| `.github/workflows/` | New | Retained backend quality/security CI gates |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Foundation overbuild | Med | Keep one source, one symbol, one timeframe, and bounded navigation |
| Full-history materialization | Med | Enforce filtering, ordering, and limiting in DuckDB |
| Official slim image has OS findings | Med | Keep image choice explicit; rely on retained backend controls and documented review |

## Rollback Plan

Revert this proposal and related container/security planning changes. No application-data migration is expected; product behavior and PR1 scope remain unchanged.

## Dependencies

- FastAPI, DuckDB, Vite, React 19, strict TypeScript, Lightweight Charts, Docker Compose, official `python:3.14-slim`, pytest, Ruff, mypy, pip-audit, and Semgrep CE.

## Success Criteria

- [x] **PR 1:** Backend returns bounded NDX `1m` windows from read-only DuckDB, including
  deterministic terminal-page and empty-table responses.
- [ ] **PR 2:** Frontend requests more history only when navigation requires it.
- [ ] **PR 2:** Generated TypeScript types align with FastAPI OpenAPI.
- [x] **PR 1:** CI enforces retained backend controls and contains no DHI, Trivy, attestation,
  registry/digest, or temporary-CVE requirements.

## Implementation State

PR 1 is complete: its FastAPI/DuckDB boundary, official `python:3.14-slim` image, read-only
Compose mount, health/readiness events, backend quality gates, and operations guidance are in
place. PR 2 frontend/chart work remains intentionally unimplemented.
