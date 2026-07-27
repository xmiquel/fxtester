# Delta for candlestick-terminal

## MODIFIED Requirements

### Requirement: Render candle windows at any supported timeframe

The system MUST display candlesticks from backend-delivered windows at the selected timeframe. The CandlestickChart MUST accept a `timeframe` prop. Each candle MUST represent the aggregation interval of the selected timeframe (1m, 5m, 15m, or 1h). Chart axis labels MUST show the selected timeframe. When no candles are available, the terminal MUST show an empty state.
(Previously: 1m-only, each candle represented exactly one minute, no timeframe prop)

#### Scenario: Candles are available

- GIVEN a backend candle window is available
- WHEN the terminal loads the window at timeframe "5m"
- THEN the candles are displayed with 5-minute bucket spacing
- AND the axis labels show "5m"

#### Scenario: No candle data is available

- GIVEN no candles are returned for the selected window
- WHEN the terminal loads
- THEN the empty state remains visible

#### Scenario: Timeframe switch triggers reload

- GIVEN a candle window is loaded at "1m"
- WHEN the timeframe changes to "1h"
- THEN the chart clears and requests a new window at "1h"

### Requirement: Page history with bounded cursor windows

The system MUST request another backend window only after user navigation moves beyond the currently loaded range. Cursor values MUST align with bucket boundaries of the selected timeframe. Each timeframe MUST maintain its own cursor state via distinct React Query cache keys. The UI MUST NOT materialize the full historical series in memory.
(Previously: single cursor, 1m bucket alignment only)

#### Scenario: Move to earlier candles at selected timeframe

- GIVEN a candle window is already loaded at "15m"
- WHEN the user navigates to an earlier range
- THEN the backend receives a cursor aligned to a 15-minute bucket boundary
- AND the next older window is fetched

#### Scenario: Initial load is requested

- GIVEN the terminal opens for the first time
- WHEN the chart requests data
- THEN only the first bounded window is loaded
- AND the cursor is set to the latest bucket boundary of the selected timeframe
