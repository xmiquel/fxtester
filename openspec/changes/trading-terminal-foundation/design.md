# Design: Trading Terminal Foundation

## Technical Approach

PR 1 delivers the backend, container, and CI foundation: NDX-only, `1m`, read-only, and bounded
to 200 candles, plus only a minimal frontend startup placeholder. FastAPI is the contract and
DuckDB is the query/aggregation boundary. The backend uses official `python:3.14-slim` with
normal CPython and a glibc-compatible DuckDB wheel. The one-chart data flow, chart rendering, and
navigation/pagination are target behavior for PR 2; PR 2 will add the TanStack Query client
without changing the backend boundary.

## Architecture Decisions

### Decision: PR 2 single-chart UI, multi-chart-ready data model

| Option | Tradeoff | Decision |
|---|---|---|
| Implement the one-chart flow and rendering in PR 2, with a chart-agnostic query/data model | Keeps PR 1 limited to foundation/startup while supporting future concurrent charts cleanly | **Use it** |
| Implement chart rendering in PR 1 or add multi-chart UI | Expands the foundation PR and blurs the delivery boundary | Reject |

### Decision: Query keys represent market windows only

| Option | Tradeoff | Decision |
|---|---|---|
| Key by `symbol`, `timeframe`, `cursor/window`, `limit` | Shared cache for identical windows; safe concurrent reuse | **Use it** |
| Include visual chart-instance identity | Prevents sharing; duplicates identical requests | Reject |

### Decision: Bounded infinite pagination

| Option | Tradeoff | Decision |
|---|---|---|
| `useInfiniteQuery` + `maxPages` + explicit cache lifetime | Controls memory while keeping navigation simple | **Use it** |
| Unbounded page accumulation | Easier initially, but risks client growth over time | Reject |

### Decision: Backend remains the only aggregation location

| Option | Tradeoff | Decision |
|---|---|---|
| DuckDB handles future timeframe aggregation | Keeps logic near data and preserves frontend simplicity | **Use it** |
| Frontend aggregates candles | Faster to prototype, but wrong boundary | Reject |

### Decision: Official Python backend base

| Option | Tradeoff | Decision |
|---|---|---|
| DHI image with registry, digest, attestation, and Trivy prerequisites | Adds supply-chain workflow assumptions outside this product slice | Reject |
| Official `python:3.14-slim` | Simple public upstream, CPython 3.14, and compatible with the existing glibc DuckDB dependency | **Use it** |

Normal CPython 3.14 is required; the free-threaded build is out of scope. DHI, registry/digest pinning, attestations, Trivy, and temporary CVE exceptions are not release prerequisites. Dependency and source security gates remain mandatory.

## Data Flow

PR 1 startup placeholder → (PR 2) single chart view state derives market-window params →
`useInfiniteQuery` fetches/caches pages → identical windows dedupe across any future chart →
backend validates request and returns ≤200 candles → DuckDB reads the source read-only and applies
filtering/ordering/limit → (PR 2) chart renders the returned pages and requests more history on
navigation.

    Chart A local state     Chart B local state (future)
            │                         │
            └──── window params ──────┘
                      ↓
          TanStack Query cache/dedupe
                      ↓
           FastAPI window endpoint
                      ↓
              DuckDB read-only query

Deployment path: official Python image → compatible DuckDB wheel install/test → application quality and dependency/source security gates → deployment.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/trading-terminal-foundation/design.md` | Modify | Clarify single-chart slice, shared window cache, bounded pagination, and backend-only aggregation |
| `frontend/index.html` and startup placeholder files | Implemented in PR 1 | Minimal frontend startup surface only; no chart data flow or rendering |
| `frontend/src/features/candles/queryKeys.ts` | Create in PR 2 | Market-window query key builder without chart-instance identity |
| `frontend/src/features/candles/useCandleWindow.ts` | Create in PR 2 | `useInfiniteQuery` hook with `maxPages` and explicit cache lifetime |
| `frontend/src/features/candles/CandlestickChart.tsx` | Modify in PR 2 | Keep visual state local; consume shared window data |
| `backend/app/features/candles/window.py` | Modify | Preserve 200-response policy and keep future aggregation backend-only |
| `docker/backend.Dockerfile` | Implemented in PR 1 | Uses `python:3.14-slim`, asserts CPython 3.14, and imports DuckDB |
| `.github/workflows/ci.yml` | Implemented in PR 1 | Runs pytest with coverage, Ruff including `S` rules, mypy, pip-audit, Semgrep CE, and Compose readiness/mount/event checks; no Trivy, attestation, or registry credentials |
| `docs/operations.md` | Implemented in PR 1 | Documents public-image rebuilds, readiness event checks, dependency/source findings, and rollback to the last known-good application image |
| `docker-compose.yml` | Implemented in PR 1 | Preserves the read-only DuckDB bind mount and health-gated frontend startup |

## Interfaces / Contracts

```ts
interface CandleWindowQueryKeyInput {
  symbol: string;
  timeframe: "1m";
  cursor: string | null;
  limit: number;
}
```

Query functions MUST forward `signal` to `fetch`. Page data MUST be treated as bounded snapshots, not an unbounded append-only series.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | PR 2 query key shape, window sharing, bounded page retention | Vitest |
| Integration | PR 2 identical windows reuse cache; distinct windows can run concurrently | React Query client + mocked API |
| E2E | PR 2 one chart renders and paginates without duplicate candles | Playwright |
| Container | CPython 3.14, DuckDB import, read-only source, readiness | Build official `python:3.14-slim`, run the image and health/readiness checks |
| Security | Python dependencies and source rules | `pip-audit`, Ruff `S` rules, and Semgrep CE; failures block release |

## Migration / Rollout

PR 1 rollout builds the official image, runs all retained quality/security gates, starts Compose
with the read-only source, verifies `/ready`, and confirms the frontend startup placeholder. PR 2
adds the chart-flow and rendering checks. On failure, fix the image or dependencies and rerun the
gates. Roll back by redeploying the last known-good application commit/image; no database
migration, registry access, attestation, digest update, Trivy scan, or CVE exception is required.
Keep the eventual one-chart behavior, 200-candle policy, and backend-only future aggregation
unchanged.

## Open Questions

None. PR 1 implementation is complete with the minimal frontend startup placeholder; the one-chart
data flow, rendering, and pagination remain deferred to PR 2.
