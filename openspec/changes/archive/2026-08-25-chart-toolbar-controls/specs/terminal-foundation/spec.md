# Delta for terminal-foundation

## MODIFIED Requirements

### Requirement: Multi-timeframe bounded candle slice

The system MUST accept positive-integer timeframe tokens with case-sensitive units `m`, `h`, `d`, `w`, and `M`, aggregate at most 1000 candles, and preserve existing cursor isolation and pagination limits. Minute/hour values use fixed intervals; `d` uses the raw timestamp's calendar day, `w` Monday-through-Sunday calendar weeks, and `M` the raw timestamp's calendar month. The system MUST NOT timezone-convert DuckDB market timestamps.
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

### Requirement: Expose available timeframes via API

The system MUST expose `GET /timeframes` as a JSON array of strings including the supported seeded values and case-sensitive `w` and `M` capabilities.
(Previously: the response was `[`"1m"`, `"5m"`, `"15m"`, `"1h"`]`.)

#### Scenario: Expanded catalog
- GIVEN the backend is running
- WHEN a client requests `GET /timeframes`
- THEN the JSON array includes `1m`, `5m`, `15m`, `1h`, and `1d`
