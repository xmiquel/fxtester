# candlestick-terminal Specification

## Purpose

Define how the terminal renders and pages supported multi-timeframe candlesticks from bounded backend windows in the first slice.

## Delivery Status

Historical delivery note corrected after PR 2 review remediation: PR 1 delivered the bounded backend candle-window API and PR 2 delivered chart rendering and browser-driven history paging. The requirements below describe the delivered terminal behavior.

## Requirements

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

### Requirement: Page history with retained cursor windows

The system MUST request another backend window only after pointer-gated user navigation reaches the near edge of the currently loaded range. Cursor values MUST align with bucket boundaries of the selected timeframe. Each symbol/timeframe MUST maintain its own cursor state via distinct React Query cache keys. The chart instance and visible logical range MUST persist while older pages are prepended. Loaded pages MUST be retained up to 20,000 candles per active symbol/timeframe query, with no eviction below that cap.
(Previously: single cursor, 1m bucket alignment only)

#### Scenario: Move to earlier candles at selected timeframe

- GIVEN a candle window is already loaded at "15m"
- WHEN the user navigates to an earlier range
- THEN the backend receives a cursor aligned to a 15-minute bucket boundary
- AND the next older window is fetched only after the pointer-gated near-edge threshold is reached

#### Scenario: Retention cap prevents another page

- GIVEN loaded pages approach the 20,000-candle limit for the active symbol/timeframe query
- WHEN the final retained page reports `has_more: true` but another 1000-candle page would exceed the cap
- THEN no additional request is made
- AND the cap status is shown without evicting retained candles

#### Scenario: Initial load is requested

- GIVEN the terminal opens for the first time
- WHEN the chart requests data
- THEN only the first page of at most 1000 candles is loaded
- AND the cursor is set to the latest bucket boundary of the selected timeframe
