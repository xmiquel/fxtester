# Delta for terminal-foundation

## MODIFIED Requirements

### Requirement: Multi-timeframe bounded candle slice

The system MUST support timeframes "1m", "5m", "15m", and "1h" via on-the-fly DuckDB `date_bin` aggregation on `dt_ohlc_m1`. The `/candles` endpoint MUST accept a `?timeframe=` query parameter. Each timeframe maps to a DuckDB interval: `'1 minute'`, `'5 minutes'`, `'15 minutes'`, `'1 hour'`. Default remains "1m". The API MUST filter, order, and limit each response to at most 200 candles. The 200-candle policy MAY increase later without architectural change.
(Previously: "1m" was the only supported timeframe, no timeframe parameter)

#### Scenario: Request with a valid timeframe

- GIVEN the `dt_ohlc_m1` source contains 1m OHLC data
- WHEN a client requests `/candles?symbol=NDX&timeframe=5m`
- THEN the backend applies `date_bin(INTERVAL '5 minutes', datetime, TIMESTAMP 'epoch')`
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

- GIVEN a timeframe of "1h" and a cursor value is provided
- WHEN the backend filters `WHERE datetime < ?`
- THEN the cursor is treated as an exclusive upper bound applied BEFORE the `date_bin` grouping
- AND the response `next_cursor` aligns to the last bucket boundary

#### Scenario: Source mutation remains forbidden

- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: No non-analysis product paths

The system MUST NOT expose real MT5 or CSV ingestion, source writes, broker/order paths, auth, live-feed controls, or watchlists in this slice.
(Previously: included timeframe selector in the prohibition list)

#### Scenario: Execution or auth is sought

- GIVEN a user looks for trading or account actions
- WHEN the terminal renders
- THEN those controls are not available

#### Scenario: Ingestion paths are sought

- GIVEN a user looks for MT5 or CSV ingestion
- WHEN the terminal renders
- THEN those paths are not present

## REMOVED Requirements

### Requirement: 1m-only bounded candle slice

(Reason: Replaced by multi-timeframe bounded candle slice above — the 1m restriction is removed in favor of four supported timeframes via date_bin aggregation.)
(Migration: The "A later timeframe is considered" scenario is no longer needed; timeframe selection is now a first-class capability, not a future concern.)

## ADDED Requirements

### Requirement: Expose available timeframes via API

The system MUST expose a `GET /timeframes` endpoint returning the supported timeframe list as a JSON array of strings.

#### Scenario: Timeframes endpoint returns full list

- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN the response is `["1m", "5m", "15m", "1h"]`
