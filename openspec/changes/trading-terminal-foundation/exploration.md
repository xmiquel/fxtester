## Exploration: Trading terminal foundation

### Current State
- PR 1 is implemented: the repository contains a FastAPI/DuckDB backend, isolated pytest suite,
  Docker Compose topology, backend CI gates, and operations documentation.
- The backend reads the host `market.duckdb` as `/data/market.duckdb` through an immutable bind
  mount, exposes only NDX `1m` cursor windows capped at 200 candles, and logs structured
  health/readiness outcomes through Uvicorn.
- PR 2 frontend/chart work remains planned but unimplemented; the current frontend is only the
  Compose startup scaffold.

### Affected Areas
- `backend/` — proposed FastAPI app, read-only DuckDB query adapter, and domain model.
- `frontend/` — proposed Vite + React + strict TypeScript trading terminal UI.
- `packages/contracts/` — optional generated API types / shared schema if a monorepo is chosen.
- `docker-compose.yml` / `docker/` — local and production container topology.
- `openspec/changes/trading-terminal-foundation/exploration.md` — this exploration artifact.

### Approaches
1. **Monorepo foundation** — one repo with `apps/api`, `apps/web`, and optional shared packages.
   - Pros: single source of truth for API contracts, easier Docker composition, simpler cross-cutting changes, one CI story.
   - Cons: more initial structure, requires discipline to keep boundaries clean.
   - Effort: Medium

2. **Split repositories** — separate backend and frontend repos with contract sync by hand or generated artifacts.
   - Pros: isolated tooling per stack, independent release cadence.
   - Cons: duplicated coordination, harder schema sharing, more friction for early-stage iteration.
   - Effort: Medium

### Recommendation
Use a **monorepo** and keep the backend as the system of record for the API contract and read-only
query boundary.

Recommended stack direction:
- **Frontend**: Vite + React 19 + strict TypeScript.
- **UI state**: TanStack Query for server state, tiny Zustand store only for local terminal state, Zod for runtime validation.
- **Transport/schema**: FastAPI OpenAPI as the contract, with generated TypeScript types on the frontend.
- **DuckDB boundary**: the existing host `market.duckdb` is mounted read-only; query access stays
  behind backend ports/adapters and the browser never touches DuckDB directly.
- **Charts**: integrate TradingView Lightweight Charts directly with a small wrapper component, not a heavy abstraction layer.
- **Containers**: separate API and web containers with Docker Compose; mount the existing DuckDB
  source as a read-only bind mount.
- **Quality**: pytest, mypy, Ruff, Vitest, Playwright, Testing Library, MSW, and TypeScript strict mode.

Decision matrix:

| Dimension | Preferred | Main alternative | Why |
|---|---|---|---|
| Workspace layout | Monorepo | Split repos | Faster schema sharing and simpler cross-stack changes |
| UI/component stack | React feature modules + small primitives | Heavy component framework | Terminal UI needs control, not abstraction |
| Data fetching/state | TanStack Query + small Zustand + Zod | Redux-style global app store | Server state and local UI state are different problems |
| API transport/schema | FastAPI OpenAPI + generated TS types | Handwritten client | Less drift, better strict-TS safety |
| DuckDB boundary | Read-only backend query adapter | Client-side or ad hoc scripts | Existing source remains immutable behind a port |
| Charts | Direct Lightweight Charts wrapper | Community wrapper | Fewer moving parts and cleaner lifecycle control |
| Docker topology | API + web + read-only source bind mount | Single container or host-run app | Better parity without persisting or ingesting source data |
| Quality/security | pytest, mypy, Ruff, Vitest, Playwright, Testing Library, MSW, ESLint | Minimal checks | Early correctness matters more than speed of setup |

### Risks
- Overengineering the foundation before the data model is proven.
- DuckDB mount readability and immutable permissions must be verified before deployment.
- Lightweight Charts needs careful resize and cleanup handling to avoid rendering leaks.

### Resulting State
The monorepo, backend-as-system-of-record, and read-only DuckDB decisions were accepted and
implemented for PR 1. The remaining frontend query/chart decisions belong to PR 2 and do not
change the completed backend boundary.
