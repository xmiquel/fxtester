# Delta for terminal-foundation

## ADDED Requirements

### Requirement: Deterministic read-only symbol catalog

The system MUST discover distinct, non-empty symbols from the market source, return them in deterministic order, and MUST NOT mutate the source.

#### Scenario: Catalog is available
- GIVEN the read-only market source contains valid symbols
- WHEN symbol discovery runs
- THEN the catalog contains each valid symbol once in stable sorted order

#### Scenario: Catalog has no usable symbols
- GIVEN discovery returns no non-empty symbols
- WHEN the catalog is requested
- THEN the system returns an explicit empty result and does not select a fallback symbol
- AND health checks remain successful because the empty catalog is valid

## MODIFIED Requirements

### Requirement: Read-only DuckDB market source

The system MUST use `D:\repos_2026\98-tstlocal\data\market.duckdb` as the concrete source database, query `dt_ohlc_m1` for discovered valid symbols, and preserve source column fidelity for `datetime`, `symbol`, `OPEN`, `high`, `low`, quoted `close`, `tickvol`, `volume`, `spread`, `origen`, and `fecha_carga`. The backend/container MUST NOT mutate the source database. Catalog unavailability MUST produce typed 503 behavior and MUST NOT trigger an `NDX` fallback. (Previously: the source query was constrained to the initial `NDX` slice.)

#### Scenario: Load a discovered symbol window
- GIVEN the host DuckDB file is mounted read-only
- WHEN the backend requests candles for a catalog symbol
- THEN the response uses source columns without renaming or mutation

#### Scenario: Source mutation is attempted
- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: Retained cursor-paged candle windows

The system MUST filter, order, and validate explicit symbols against the fresh discovered catalog, and limit each response to at most 1000 candles for the selected timeframe. The frontend MUST request older pages only after pointer-gated navigation reaches the near edge, preserve the chart instance and visible logical range while older pages are prepended, and retain loaded pages up to 20,000 candles per active symbol/timeframe query without evicting pages below that cap. An omitted symbol MUST resolve to `NDX` only when fresh discovery contains `NDX`; otherwise it MUST return typed 400 or 503 according to the discovery result. (Previously: the API bounded the fixed `NDX` slice.)

#### Scenario: Unsupported symbol is requested
- GIVEN a requested symbol is absent from the current catalog
- WHEN the candle API resolves the request
- THEN it rejects the request with a documented client error

#### Scenario: Omitted symbol is not freshly resolvable
- GIVEN fresh discovery succeeds without `NDX`, or discovery is unavailable
- WHEN the candle API resolves an omitted symbol
- THEN it returns typed 400 or 503 respectively and never silently defaults

#### Scenario: Request exceeds the current page cap
- GIVEN a candle window larger than 1000 rows is requested for a supported symbol and timeframe
- WHEN the API resolves the request
- THEN the response contains no more than 1000 candles

#### Scenario: Retained history reaches the client safety cap
- GIVEN loaded pages for an active symbol/timeframe query reach the 20,000-candle retention boundary
- WHEN the operator navigates near the oldest retained candle
- THEN no additional older page is prefetched
- AND the chart and visible range remain available without evicting retained pages below the cap

### Requirement: No non-analysis product paths

The system MUST NOT expose real MT5 or CSV ingestion, source writes, broker/order paths, auth, live-feed controls, or watchlists in this slice. (Previously: the same exclusions applied while the market context was fixed to `NDX`.)

#### Scenario: Execution or auth is sought
- GIVEN a user looks for trading or account actions
- WHEN the terminal renders
- THEN those controls are not available

#### Scenario: Ingestion paths are sought
- GIVEN a user looks for ingestion controls
- WHEN the terminal renders
- THEN those paths are not present
