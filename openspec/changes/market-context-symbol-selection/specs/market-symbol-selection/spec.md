# market-symbol-selection Specification

## Purpose

Define discovery, exposure, validation, and selection of symbols available in the read-only market source.

## Requirements

### Requirement: Expose a validated symbol catalog

The system MUST expose `GET /symbols` returning `{ "symbols": string[] }`. The response MUST contain distinct, non-empty symbols in deterministic order. Catalog failures MUST produce a documented service-unavailable response, while a valid empty catalog MUST remain an explicit empty result.

#### Scenario: Catalog request succeeds
- GIVEN the read-only source contains usable symbols
- WHEN a client calls `GET /symbols`
- THEN it receives the deterministic validated catalog

#### Scenario: Catalog is empty
- GIVEN the read-only source contains no usable symbols
- WHEN a client calls `GET /symbols`
- THEN it receives HTTP 200 with an empty `symbols` array
- AND the empty result MUST NOT be treated as deployment unhealthy

#### Scenario: Catalog discovery fails
- GIVEN the source cannot be queried
- WHEN a client calls `GET /symbols`
- THEN it receives a documented 503 response without fabricated symbols

### Requirement: Validate candle symbols authoritatively

The candle API MUST validate explicit symbols against the fresh discovered catalog and MUST reject unsupported values with a documented 400 response. An explicit empty `symbol=` MUST be treated as invalid explicit input and MUST NOT use omitted-symbol compatibility. When the symbol is omitted, the API MAY resolve it to `NDX` only if fresh discovery succeeds and contains `NDX`; it MUST return a typed 400 when fresh discovery succeeds without `NDX`, and MUST NOT silently fallback when discovery is unavailable or fails. Validation MUST remain authoritative at the backend boundary.

The omitted-symbol-to-`NDX` behavior is a temporary legacy-client compatibility path.
The catalog-driven frontend MUST continue to send its selected symbol explicitly;
this requirement does not reintroduce a fixed-`NDX` frontend context.

#### Scenario: Supported symbol is requested
- GIVEN a symbol is present in the catalog
- WHEN the client requests `/candles` for it
- THEN the request is eligible for the existing bounded `1m` window

#### Scenario: Unsupported symbol is requested
- GIVEN a symbol is absent from the catalog
- WHEN the client requests `/candles` for it
- THEN the API returns a documented 400 response

#### Scenario: Omitted symbol is temporarily compatible
- GIVEN fresh discovery succeeds and contains `NDX`
- WHEN the client requests `/candles` without a symbol
- THEN the API resolves the request to `NDX`

#### Scenario: Explicit empty symbol is rejected
- GIVEN fresh discovery contains `NDX`
- WHEN the client requests `/candles?symbol=`
- THEN the API returns the documented typed 400 response
- AND it MUST NOT resolve the request to `NDX`

#### Scenario: Omitted symbol cannot be resolved
- GIVEN fresh discovery succeeds and does not contain `NDX`
- WHEN the client requests `/candles` without a symbol
- THEN the API returns a typed 400 response

#### Scenario: Omitted symbol cannot use unavailable discovery
- GIVEN catalog discovery fails or the catalog is unavailable
- WHEN the client requests `/candles` without a symbol
- THEN the API returns the documented 503 response and does not fallback to `NDX`

### Requirement: Preserve explicit non-goals

This capability MUST NOT add timeframes beyond `1m`, aggregation, orders, authentication, ingestion, writes, live feeds, watchlists, or full-history materialization. It MUST preserve the 200-candle response window and read-only source boundary.

#### Scenario: Non-goal is requested
- GIVEN a client requests an order, write, alternate timeframe, or full history
- WHEN the system evaluates the request
- THEN the capability does not provide that path
