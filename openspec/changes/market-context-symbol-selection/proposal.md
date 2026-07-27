# Proposal: Market Context Selection for Symbols

## Intent

Replace the hard-coded NDX market context with a validated symbol catalog discovered from the read-only DuckDB source and expose it through a user-visible selector. Omitted `/candles` symbols remain temporarily compatible only when NDX is present in the fresh catalog.

## Scope

### In Scope
- Add a backend symbol-list contract sourced from `dt_ohlc_m1`, with deterministic ordering and validation.
- Validate `/candles` symbols against the fresh discovered catalog while preserving `1m` and the 200-candle limit.
- Add temporary omitted-symbol NDX compatibility: default only when fresh discovery contains NDX; explicit empty and unsupported symbols remain typed 400 responses.
- Define empty-catalog health behavior; an empty catalog is valid and MUST NOT make health checks fail.
- Fetch `/symbols`, select its deterministic first symbol, and render an accessible selector, empty state, and retryable error state.
- Keep OpenAPI and generated TypeScript contracts aligned.

### Out of Scope
- Timeframe selection, aggregation, or any timeframe other than `1m`.
- Orders, authentication, ingestion, writes, live feeds, watchlists, timeframe selection, or full-history materialization.
- Changing cursor paging, the 200-window policy, chart rendering semantics, or the read-only database mount.

## Capabilities

### New Capabilities
- `market-symbol-selection`: Discover, validate, expose, and select symbols available in the read-only market source.

### Modified Capabilities
- `terminal-foundation`: Replace the fixed NDX source/API constraint with a discovered valid-symbol catalog; retain read-only DuckDB, source-column fidelity, `1m`, and bounded windows.
- `candlestick-terminal`: Render selected-symbol context with safe catalog states and symbol-keyed UI behavior.

## Approach

Add a repository/service method that queries distinct non-empty symbols from `dt_ohlc_m1` through a fresh read-only DuckDB query, returning a stable sorted list. Expose it as `GET /symbols` (`{ "symbols": string[] }`); `/candles?symbol=...` validates explicit symbols against that fresh catalog and returns a documented typed 400 when unsupported. For temporary compatibility, an omitted symbol defaults to NDX only if the same fresh catalog contains NDX; `?symbol=` is explicit input and is rejected. Catalog errors, unavailable databases, and empty catalogs MUST NOT trigger that fallback; empty remains a valid response and must not fail health checks. The frontend fetches the catalog before candles, selects the deterministic first symbol, exposes it through an accessible selector, and isolates selected-symbol paging/cache state.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `backend/app/features/candles/` | Modified | Symbol discovery, validation, and service/repository contracts. |
| `backend/app/main.py` | Modified | `GET /symbols`, candle validation, OpenAPI models/errors. |
| `frontend/src/features/candles/` | Modified | Selector, symbol-aware chart, and cache keys use the catalog. |
| `frontend/src/App.tsx` and generated API types | Modified | Selector UI and generated contract alignment follow API changes. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Catalog query fails or database is unavailable | Med | Typed failure handling; compatibility fallback is explicitly disabled for errors/unavailability. |
| Empty catalog is treated as unhealthy | Med | Treat empty discovery as valid and exclude catalog cardinality from health-check failure criteria. |
| Stale/invalid selected symbol reaches candles | Med | Backend authoritative validation plus symbol in query/cache keys. |
| Cross-symbol cache or UI state leakage | Med | Reset/derive chart paging from symbol-keyed queries and test transitions. |

## Rollback Plan

Revert the proposal/API contract changes and restore the prior required-symbol behavior or fixed NDX request path as appropriate. No database migration or source mutation is required; the temporary default can be removed independently when PR2 lands.

## Dependencies

- Existing DuckDB `dt_ohlc_m1` table, FastAPI OpenAPI export, generated frontend types, React Query, and current test/CI tooling.

## Success Criteria

- [ ] `GET /symbols` returns the validated, deterministically ordered source catalog and safe 503/empty behavior.
- [ ] `/candles` distinguishes an omitted symbol from explicit empty input, returns typed 400 for explicit invalid values, and defaults only omitted symbols to NDX when fresh discovery contains NDX.
- [ ] Empty catalogs remain valid and do not fail health checks; catalog errors/unavailable databases never silently default to NDX.
- [ ] Catalog gating prevents any candle request for empty/unavailable catalogs while selection uses only discovered symbols.
- [ ] Contract and unit/integration coverage verifies fresh validation, selection/cache isolation, empty/error states, health behavior, and unchanged non-goals.
