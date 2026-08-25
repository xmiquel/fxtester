# candlestick-terminal Specification

## Purpose

Define how the terminal renders and pages supported multi-timeframe candlesticks from bounded backend windows in the first slice.

## Delivery Status

Historical delivery note corrected after PR 2 review remediation: PR 1 delivered the bounded backend candle-window API and PR 2 delivered chart rendering and browser-driven history paging. The requirements below describe the delivered terminal behavior.

## Requirements

### Requirement: Render candle windows at any supported timeframe
The system MUST display candlesticks from backend-delivered windows at the selected valid timeframe, including custom positive-integer values using `m`, `h`, `d`, `w`, or `M`. The chart MUST label the selected exact token and show an empty state when no candles are available.
(Previously: supported rendering was limited to `1m`, `5m`, `15m`, and `1h`.)

#### Scenario: Expanded timeframe renders
- GIVEN a candle window is available for `1d`
- WHEN the terminal loads it
- THEN candles display with `1d` axis labels

#### Scenario: Timeframe switch reloads
- GIVEN a window is loaded at `1m`
- WHEN the timeframe changes to `2w`
- THEN the chart clears and requests a new `2w` window

#### Scenario: Empty window
- GIVEN no candles are returned for a valid selected timeframe
- WHEN the terminal loads
- THEN the empty state remains visible

### Requirement: Page history with retained cursor windows
The system MUST request another backend window only after pointer-gated user navigation reaches the near edge of the currently loaded range. Cursor values MUST align with bucket boundaries of the selected timeframe. Each symbol/timeframe MUST maintain its own cursor state via distinct React Query cache keys. The chart instance and visible logical range MUST persist while older pages are prepended. Loaded pages MUST be retained up to 20,000 candles per active symbol/timeframe query, with no eviction below that cap.
(Previously: single cursor, 1m bucket alignment only)

#### Scenario: Move to earlier candles at selected timeframe
- GIVEN a candle window is already loaded at `15m`
- WHEN the user navigates to an earlier range
- THEN the backend receives a cursor aligned to a `15m` bucket boundary
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
