# Delta for candlestick-terminal

## MODIFIED Requirements

### Requirement: Render candle windows at the selected timeframe

The system MUST fetch the symbol catalog before displaying a chart, select its deterministic first symbol, and provide an accessible selector for any catalog symbol. Each candle MUST represent the aggregation interval of the selected timeframe (`1m`, `5m`, `15m`, or `1h`). A valid empty catalog MUST show an accessible no-symbols state without a candle request; catalog failure MUST show an accessible retryable error without a candle request. Selected-symbol and selected-timeframe paging caches MUST remain isolated. (Superseded historical behavior: this delta previously described a `1m`-only terminal with a fixed `NDX` context.)

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

### Requirement: Page history with retained cursor windows

The system MUST request another backend window in pages of at most 1000 candles only after an intentional pointer drag moves the visible range near the currently loaded left edge. The UI MUST NOT materialize the full historical series. Each selected symbol/timeframe MUST use an isolated paging/cache state. The chart instance and visible logical range MUST remain stable while older pages are prepended. Loaded pages MUST be retained without eviction up to a 20,000-candle safety limit; older history loading MUST stop at that limit. (Superseded historical behavior: earlier wording described bounded paging without the pointer gate, stable range preservation, or the retention cap.)

#### Scenario: Move to earlier candles at the selected timeframe
- GIVEN a candle window is loaded
- WHEN the user pointer-drags the chart near the left edge
- THEN the backend is asked for the next older window of at most 1000 candles
- AND the visible logical range remains stable when the page is prepended

#### Scenario: Retention safety limit
- GIVEN 20,000 candles are retained for the active symbol/timeframe query
- WHEN the user navigates near the left edge
- THEN older history loading stops at the 20,000-candle safety limit
- AND retained candles are not evicted
