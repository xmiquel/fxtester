# Delta for terminal-foundation

## MODIFIED Requirements

### Requirement: Multi-timeframe bounded candle slice

The system MUST accept any positive integer followed by `m` or `h`, case-insensitively, on `/candles?timeframe=` with no upper bound. It MUST canonicalize the response token to lowercase, aggregate non-`1m` data into epoch-aligned buckets, and return at most 1000 candles in ascending order with backward pagination. The frontend MUST retain at most 20,000 candles per symbol/timeframe query. Default and `1m` direct-source semantics MUST remain unchanged.
(Previously: Only `1m`, `5m`, `15m`, and `1h` were supported and `2h` was invalid.)

#### Scenario: Request with a valid arbitrary timeframe
- GIVEN `dt_ohlc_m1` contains source data
- WHEN a client requests `/candles?symbol=NDX&timeframe=3H`
- THEN the response timeframe is `3h`, each bucket is epoch-aligned to three hours, and OHLCV values reduce as first open, max high, min low, last close, and summed volumes

#### Scenario: Default timeframe when omitted
- GIVEN no `timeframe` parameter is provided
- WHEN a client requests `/candles?symbol=NDX`
- THEN the API defaults to `1m` and returns unaggregated source candles

#### Scenario: Invalid timeframe value
- GIVEN a request uses `timeframe=0m`, `timeframe=2x`, or an incomplete token
- WHEN the API validates the parameter
- THEN the response is a typed 400 error stating that a positive integer followed by `m` or `h` is required

#### Scenario: Cursor alignment to bucket boundary
- GIVEN a non-`1m` timeframe and an arbitrary ISO-8601 cursor are provided
- WHEN the backend prepares the request
- THEN timezone-aware cursors normalize to UTC and floor to the epoch-aligned bucket start before filtering
- AND pages are oldest-to-newest, `next_cursor` identifies the oldest returned bucket, and the next page excludes that bucket

#### Scenario: One-minute compatibility
- GIVEN a `1m` request with or without a cursor
- WHEN the backend reads the window
- THEN existing source ordering, cursor, and candle values remain unchanged

#### Scenario: Source mutation remains forbidden
- GIVEN a write path is triggered against the market database
- WHEN the backend evaluates the request
- THEN no mutation is applied and the source file remains unchanged

### Requirement: Expose available timeframes via API

The system MUST expose the finite quick-discovery catalog as a JSON array of strings. The catalog MUST NOT constrain valid `/candles` tokens.
(Previously: The endpoint list was the complete supported timeframe set.)

#### Scenario: Timeframes endpoint returns catalog
- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN it returns `['1m', '2m', '5m', '15m', '1h']` in granularity order

## ADDED Requirements

### Requirement: Candle errors preserve request boundaries

The API MUST reject malformed cursors with a 422 response, unknown symbols with the existing typed symbol error, and unavailable databases with the existing database error behavior; valid arbitrary timeframe parsing MUST occur before candle access.

#### Scenario: Cursor or symbol is invalid
- GIVEN a request has a non-ISO cursor or symbol absent from the catalog
- WHEN `/candles` is evaluated
- THEN it returns the corresponding 422 or typed symbol error without returning candles
