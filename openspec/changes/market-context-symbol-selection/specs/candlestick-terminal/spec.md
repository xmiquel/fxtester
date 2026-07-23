# Delta for candlestick-terminal

## MODIFIED Requirements

### Requirement: Render one-minute candle windows

The system MUST fetch the symbol catalog before displaying a `1m` chart, select its deterministic first symbol, and provide an accessible selector for any catalog symbol. Each candle MUST represent exactly one minute. A valid empty catalog MUST show an accessible no-symbols state without a candle request; catalog failure MUST show an accessible retryable error without a candle request. Selected-symbol paging and caches MUST remain isolated. (Previously: the terminal rendered a fixed `NDX` context.)

#### Scenario: A catalog symbol is selected
- GIVEN fresh discovery returns a deterministic catalog
- WHEN the terminal loads
- THEN it selects the first symbol and requests its explicit `1m` candle window
- AND the operator can select another catalog symbol

#### Scenario: No candle data is available
- GIVEN no candles are returned for the current window
- WHEN the terminal loads
- THEN the existing accessible empty state remains visible

#### Scenario: Catalog is empty or unavailable
- GIVEN the catalog is empty or cannot be fetched
- WHEN the terminal loads
- THEN it renders the corresponding accessible empty or retryable error state
- AND it MUST NOT request NDX candles

### Requirement: Page history with bounded cursor windows

The system MUST request another backend window only after user navigation moves beyond the currently loaded range. The UI MUST NOT materialize the full historical series. Each selected symbol MUST use a symbol-keyed paging/cache state. (Previously: paging was bounded but not required to be symbol-isolated.)

#### Scenario: Move to earlier candles
- GIVEN a candle window is loaded
- WHEN the user navigates to an earlier range
- THEN the backend is asked for the next older bounded window
