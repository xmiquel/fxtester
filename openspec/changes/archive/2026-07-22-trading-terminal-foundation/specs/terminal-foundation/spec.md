# terminal-foundation Specification

## Purpose

Define the first-slice terminal foundation for a single-trader workspace backed by a concrete read-only DuckDB source.

## Requirements

### Requirement: Read-only DuckDB market source

The system MUST use `D:\repos_2026\98-tstlocal\data\market.duckdb` as the concrete source database, query `dt_ohlc_m1` for the initial `NDX` slice, and preserve source column fidelity for `datetime`, `symbol`, `OPEN`, `high`, `low`, quoted `close`, `tickvol`, `volume`, `spread`, `origen`, and `fecha_carga`. The backend/container MUST NOT mutate the source database.

#### Scenario: Load the initial NDX window

- GIVEN the host DuckDB file is mounted read-only
- WHEN the backend requests the initial `NDX` candles from `dt_ohlc_m1`
- THEN the response uses the source columns without renaming or mutation

#### Scenario: Source mutation is attempted

- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: 1m-only bounded candle slice

The system MUST implement `1m` as the only timeframe in this slice. `1m` is a scope boundary, not an architectural limit; later selected timeframes MUST be handled by backend DuckDB aggregation/querying, not frontend aggregation. The API MUST filter, order, and limit each response to at most 200 candles. The 200-candle policy is the current runtime response-window and frontend fixture limit, and MAY increase later without architectural change.

#### Scenario: Request exceeds the current window cap

- GIVEN a candle window larger than 200 rows is requested
- WHEN the API resolves the request
- THEN the response contains no more than 200 candles

#### Scenario: A later timeframe is considered

- GIVEN a later selected timeframe is requested in a future slice
- WHEN the request is handled
- THEN aggregation stays in the backend DuckDB path and not in the frontend

### Requirement: No non-analysis product paths

The system MUST NOT expose real MT5 or CSV ingestion, source writes, broker/order paths, auth, live-feed controls, watchlists, or a timeframe selector in this slice.

#### Scenario: Execution or auth is sought

- GIVEN a user looks for trading or account actions
- WHEN the terminal renders
- THEN those controls are not available

#### Scenario: Ingestion or selector paths are sought

- GIVEN a user looks for MT5/CSV ingestion or a timeframe selector
- WHEN the terminal renders
- THEN those paths are not present
