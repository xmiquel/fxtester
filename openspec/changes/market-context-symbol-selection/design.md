# Design: Market Context Symbol Selection

## Technical Approach

Extend the existing `features/candles` repository/service path and keep PR1
backend compatibility plus a minimal frontend gate. Discovery performs a fresh, read-only query of distinct,
non-blank symbols from `dt_ohlc_m1`, returning deterministic sorted output.
`/candles` performs fresh authoritative validation on every request. If the
query parameter is omitted, it resolves to `NDX` **only when that same
successful catalog contains `NDX`**; otherwise it returns a typed error. The
frontend fetches the catalog first, selects its deterministic first symbol, and
issues explicit symbol requests. Empty and unavailable catalogs render accessible
states without a candle request. The selector owns the selected-symbol context.

### Compatibility Scope Reconciliation

The temporary omitted-symbol-to-`NDX` behavior is intentional backend compatibility
for legacy callers, not a frontend selection policy. The current frontend always
loads the catalog and sends an explicit selected symbol. This compatibility remains
until a later change removes it; it must use the same fresh catalog query as explicit
validation and must never be implemented as cached state or an unconditional fallback.

## Architecture Decisions

| Decision | Alternatives considered | Rationale |
|---|---|---|
| Keep catalog discovery in the candle repository/service boundary | New standalone catalog module | Preserves the current feature boundary and centralizes read-only source access without premature abstraction. |
| Validate explicitly and resolve omitted symbols from the same fresh catalog | Trust the client, cache catalog, or silently fallback | Backend authority prevents stale/unsupported symbols; error state cannot be confused with compatibility success. |
| Distinguish `None` from explicit `""` at candle resolution | Treat blank input as omitted | Query presence is part of the public contract; only an omitted parameter is eligible for temporary NDX compatibility. |
| Treat an empty catalog as healthy | Require at least one symbol for readiness | Empty source content is valid data, not infrastructure failure; health must measure database availability only. |
| Gate selected-symbol charts on catalog readiness | Render a fallback chart before catalog loading | Prevents invalid candle requests for valid empty or unavailable catalogs. |
| Make Compose/CI prove browser-facing frontend readiness | Probe only proxied API JSON | Health must verify the served document/module entrypoint; browser tests prove React executes with the selected symbol. |

## Data Flow

```text
/symbols ─→ fresh catalog query ─→ sorted {symbols: [...]}
/symbols ─→ deterministic first symbol → selector → explicit /candles request → selected-timeframe read
health/ready ─→ database availability only (catalog cardinality ignored)
```

All reads use the existing read-only DuckDB boundary and source-column fidelity.
Cursor paging preserves the current multi-timeframe contract, with a maximum of 1000 candles per response.
The frontend gates older-page prefetch on pointer navigation near the oldest retained range,
preserves the chart and visible range while prepending, and retains loaded pages up to 20,000
candles per active symbol/timeframe query without eviction below that cap.

## File Changes

| File | Action | Description |
|---|---|---|
| `backend/app/features/candles/window.py` | Modify | Add catalog query and typed resolution/validation while preserving read-only, cursor paging, selected timeframes, and 1000-candle pages. |
| `backend/app/main.py` | Modify | Keep `/symbols`, typed 400/503 contracts, and health/readiness independent of catalog cardinality; make omitted `symbol` optional. |
| `backend/tests/test_candles.py` | Modify | Cover NDX omission success, omission without NDX typed 400, omission on discovery failure typed 503, explicit unsupported symbols, empty catalog, health, and existing bounds. |
| `backend/openapi.json` / `frontend/src/api/generated.ts` | Regenerate | Reflect optional candle symbol and documented catalog/error schemas. |
| `docker-compose.yml` | Modify | Keep backend health database-only; make frontend health verify the served browser document and Vite module entrypoint. |
| `.github/workflows/ci.yml` | Modify | Seed NDX, verify explicit selected-symbol candles, valid empty-catalog health, browser rendering, OpenAPI drift, read-only mount, logs, and bounded response checks. |
| `docs/operations.md` | Modify | Document selected-symbol operation, typed failures, empty-catalog health, and state-aware Compose/CI verification. |
| `frontend/src/features/candles/{api,queryKeys,useSymbols,SymbolSelector,CandlestickChart}.ts*` | Modify/Create | Fetch and gate on the catalog, select the first symbol, isolate cache keys, retain loaded pages to the 20,000-candle cap, and render accessible selector/empty/error states. |

## Interfaces / Contracts

```text
GET /symbols → 200 {"symbols": string[]}      # empty is valid
GET /symbols → 503 ServiceUnavailable         # query/source failure
GET /candles?symbol=SPX → 200                 # only if SPX is fresh catalog member
GET /candles?symbol=UNKNOWN → 400 UnsupportedSymbol
GET /candles?symbol= → 400 UnsupportedSymbol # explicit empty, never omitted compatibility
GET /candles (fresh catalog contains NDX) → 200, effective symbol NDX
GET /candles (fresh catalog succeeds without NDX) → 400 UnsupportedSymbol
GET /candles (catalog unavailable/fails) → 503 ServiceUnavailable
```

The omitted-symbol 400 must identify the unresolved default (`NDX`) through
the existing typed error contract. No fabricated symbol or stale fallback is
permitted.

## Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit/integration | Query filtering, deterministic catalog, resolution matrix, typed OpenAPI responses | Pytest repository fixtures and FastAPI `TestClient`. |
| Runtime | Empty catalog remains healthy; NDX omission works; unavailable source remains 503 | Compose smoke scripts and CI temporary DuckDB scenarios. |
| Frontend/E2E | Catalog gate prevents candle requests for empty/error catalogs; selector transitions isolate symbol paging/cache state; near-edge prefetch, persistent range, and 20,000-candle retention remain enforced | Vitest/MSW and Compose browser tests. |

## Migration / Rollout

No migration or feature flag. Regenerate contracts, deploy backend/runtime/docs
together, and roll back by reverting the selector/runtime work unit. A future
change may remove omitted-symbol compatibility now that the selector supplies explicit symbols.

## Open Questions

None.
