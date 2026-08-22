# Delta for candlestick-terminal

## MODIFIED Requirements

### Requirement: Render candle windows at any supported timeframe

The system MUST display backend windows for every accepted positive-integer `m` or `h` timeframe, including canonical labels in the heading, chart accessibility label, loading state, and empty state. A timeframe change MUST reload the corresponding query; no-candle and candle-error states MUST remain actionable and distinguishable.
(Previously: Rendering was limited to `1m`, `5m`, `15m`, and `1h`.)

#### Scenario: Candles are available
- GIVEN a backend window is available at `3h`
- WHEN the terminal loads it
- THEN candles are displayed and labels identify `3h`

#### Scenario: No candle data is available
- GIVEN no candles are returned for the selected window
- WHEN the terminal loads
- THEN the `No {symbol} {timeframe} candles are available` status remains visible

#### Scenario: Timeframe switch triggers reload
- GIVEN a candle window is loaded at `1m`
- WHEN the timeframe changes to `6m`
- THEN the chart clears and requests a new `6m` window

#### Scenario: Candle request fails
- GIVEN the candle request fails before data is available
- WHEN the terminal renders
- THEN an alert shows the error and offers a retry action

### Requirement: Page history with retained cursor windows

The system MUST request older data only after pointer-gated navigation reaches the near-start threshold. Cursor values, query identity, and retained pages MUST be scoped to the selected symbol and arbitrary timeframe. The chart instance and visible logical range MUST persist when older pages are prepended. It MUST retain up to 20,000 candles and stop before exceeding that cap.
(Previously: History used a single cursor model with fixed-timeframe bucket alignment.)

#### Scenario: Move to earlier candles at selected timeframe
- GIVEN a candle window is loaded at `15h`
- WHEN the user drags or navigates to the earlier near edge
- THEN one older page is fetched with a `15h`-aligned cursor and the visible range remains stable

#### Scenario: Retention cap prevents another page
- GIVEN retained pages approach 20,000 candles and the final page reports more history
- WHEN another page would exceed the cap
- THEN no request is made and retained candles remain visible with the cap status

#### Scenario: Initial load is requested
- GIVEN the terminal opens for the first time
- WHEN the chart requests data for `37m`
- THEN only the first page of at most 1000 candles loads and its cursor starts at the latest `37m` bucket

#### Scenario: Keyboard history navigation is bounded
- GIVEN the chart region is focused and candles are loaded
- WHEN the user presses Left, Right, Home, or End
- THEN the hovered candle moves within the retained chronological window without changing the selected timeframe
