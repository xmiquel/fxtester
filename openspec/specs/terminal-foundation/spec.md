# terminal-foundation Specification

## Purpose

Define the first-slice terminal foundation for a single-trader workspace backed by a concrete read-only DuckDB source.

## Requirements

### Requirement: Read-only DuckDB market source
The system MUST use `D:\repos_2026\98-tstlocal\data\market.duckdb` as the concrete source database, query `dt_ohlc_m1` for discovered symbols and the selected timeframe, and preserve source column fidelity for `datetime`, `symbol`, `OPEN`, `high`, `low`, quoted `close`, `tickvol`, `volume`, `spread`, `origen`, and `fecha_carga`. The backend/container MUST NOT mutate the source database.

#### Scenario: Load the initial selected-symbol window
- GIVEN the host DuckDB file is mounted read-only
- WHEN the backend requests the initial candles for a discovered symbol from `dt_ohlc_m1`
- THEN the response uses the source columns without renaming or mutation

#### Scenario: Source mutation is attempted
- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: Multi-timeframe bounded candle slice
The system MUST accept positive-integer timeframe tokens with case-sensitive units `m`, `h`, `d`, `w`, and `M`, aggregate at most 1000 candles, and preserve cursor isolation and pagination limits. Minute/hour values use fixed intervals; `d` uses the raw timestamp's calendar day, `w` Monday-through-Sunday calendar weeks, and `M` the raw timestamp's calendar month. The system MUST NOT timezone-convert DuckDB market timestamps.
(Previously: only fixed `1m`, `5m`, `15m`, and `1h` epoch-aligned intervals were supported.)

#### Scenario: Calendar buckets preserve market timestamps
- GIVEN source timestamps use the NY/DST market convention
- WHEN a client requests `1d`, `1w`, or `1M`
- THEN buckets use the raw timestamp day, Monday week, or month boundary without timezone conversion

#### Scenario: Wrong-case token is rejected
- GIVEN a client requests `1H` or `1W`
- WHEN the API validates the timeframe
- THEN it returns HTTP 400 and does not aggregate data

#### Scenario: Cursor remains bounded
- GIVEN a valid custom timeframe is requested
- WHEN a candle page is returned
- THEN it contains at most 1000 candles and its query state remains isolated by symbol and exact timeframe

### Requirement: No non-analysis product paths
The system MUST NOT expose real MT5 or CSV ingestion, source writes, broker/order paths, auth, live-feed controls, watchlists, or live-feed controls in this slice.

#### Scenario: Execution or auth is sought
- GIVEN a user looks for trading or account actions
- WHEN the terminal renders
- THEN those controls are not available

#### Scenario: Ingestion paths are sought
- GIVEN a user looks for MT5 or CSV ingestion
- WHEN the terminal renders
- THEN those paths are not present

### Requirement: Expose available timeframes via API
The system MUST expose `GET /timeframes` as a JSON array of strings including supported seeded values and case-sensitive `w` and `M` capabilities.
(Previously: the response was `["1m", "5m", "15m", "1h"]`.)

#### Scenario: Expanded catalog
- GIVEN the backend is running
- WHEN a client requests `GET /timeframes`
- THEN the JSON array includes `1m`, `5m`, `15m`, `1h`, and `1d`
