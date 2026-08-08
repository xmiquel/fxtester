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

The system MUST support timeframes "1m", "5m", "15m", and "1h" via on-the-fly aggregation on `dt_ohlc_m1`. Non-"1m" aggregation MUST use epoch-aligned floor arithmetic equivalent to DuckDB `date_bin` with `TIMESTAMP 'epoch'` as the origin. The `/candles` endpoint MUST accept a `?timeframe=` query parameter. Each timeframe maps to a bucket interval of one minute, five minutes, 15 minutes, or one hour. Default remains "1m". The API MUST filter, order, and limit each response to at most 1000 candles. The frontend MUST retain loaded cursor pages up to 20,000 candles per active symbol/timeframe query, with each page containing at most 1000 candles, and MUST stop prefetching at that safety cap.
(Previously: "1m" was the only supported timeframe, no timeframe parameter)

#### Scenario: Request with a valid timeframe

- GIVEN the `dt_ohlc_m1` source contains 1m OHLC data
- WHEN a client requests `/candles?symbol=NDX&timeframe=5m`
- THEN the backend applies epoch-aligned floor arithmetic equivalent to `date_bin(INTERVAL '5 minutes', datetime, TIMESTAMP 'epoch')`
- AND each returned candle groups exactly 5 minutes of source data
- AND OHLC columns are reduced: first(open), max(high), min(low), last(close), sum(tickvol), sum(volume)
- AND the response `timeframe` field equals "5m"

#### Scenario: Default timeframe when omitted

- GIVEN no `?timeframe=` parameter is provided
- WHEN a client requests `/candles?symbol=NDX`
- THEN the backend defaults to "1m"
- AND candles are returned without `date_bin` aggregation

#### Scenario: Invalid timeframe value

- GIVEN a request with `?timeframe=2h`
- WHEN the API validates the parameter
- THEN the response is a 400 error
- AND the error message lists supported values: "1m", "5m", "15m", "1h"

#### Scenario: Cursor alignment to bucket boundary

- GIVEN a non-"1m" timeframe and an arbitrary ISO-8601 cursor value is provided
- WHEN the backend prepares the cursor for the source filter
- THEN a timezone-aware cursor is normalized to UTC
- AND the cursor is normalized down to the epoch-aligned bucket start for the requested timeframe
- AND the exclusive source filter uses that normalized bucket start before aggregation, excluding that boundary bucket and preventing partial aggregate buckets
- AND results are returned oldest-to-newest within each page while pagination moves backward from newest to older buckets
- AND the response `next_cursor` identifies the start of the oldest returned bucket, while the next page uses it as an exclusive upper bound and does not repeat that bucket
- GIVEN a "1m" timeframe and a cursor value is provided
- THEN the existing 1m cursor semantics remain unchanged

#### Scenario: Source mutation remains forbidden

- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: No non-analysis product paths

The system MUST NOT expose real MT5 or CSV ingestion, source writes, broker/order paths, auth, live-feed controls, watchlists, or live-feed controls in this slice.
(Previously: included timeframe selector in the prohibition list)

#### Scenario: Execution or auth is sought

- GIVEN a user looks for trading or account actions
- WHEN the terminal renders
- THEN those controls are not available

#### Scenario: Ingestion paths are sought

- GIVEN a user looks for MT5 or CSV ingestion
- WHEN the terminal renders
- THEN those paths are not present

### Requirement: Expose available timeframes via API

The system MUST expose a `GET /timeframes` endpoint returning the supported timeframe list as a JSON array of strings.

#### Scenario: Timeframes endpoint returns full list

- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN the response is `["1m", "5m", "15m", "1h"]`
