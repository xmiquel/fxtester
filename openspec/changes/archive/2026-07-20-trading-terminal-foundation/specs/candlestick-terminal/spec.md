# candlestick-terminal Specification

## Purpose

Define how the terminal renders and pages `1m` candlesticks from bounded backend windows in the first slice.

## Delivery Status

Historical delivery note corrected after PR 2 review remediation: PR 1 delivered the bounded
backend candle-window API and PR 2 delivered chart rendering and browser-driven history paging.
The requirements below describe the delivered terminal behavior.

## Requirements

### Requirement: Render one-minute candle windows

The system MUST display `1m` candlesticks from backend-delivered windows, and each candle MUST represent exactly one minute. When no candles are available, the terminal MUST show an empty state.

#### Scenario: Candles are available

- GIVEN a backend candle window is available
- WHEN the terminal loads the window
- THEN the candles are displayed in the chart

#### Scenario: No candle data is available

- GIVEN no candles are returned for the selected window
- WHEN the terminal loads
- THEN the empty state remains visible

### Requirement: Page history with bounded cursor windows

The system MUST request another backend window only after user navigation moves beyond the currently loaded range. The UI MUST NOT materialize the full historical series in memory.

#### Scenario: Move to earlier candles

- GIVEN a candle window is already loaded
- WHEN the user navigates to an earlier range
- THEN the backend is asked for the next older window

#### Scenario: Initial load is requested

- GIVEN the terminal opens for the first time
- WHEN the chart requests data
- THEN only the first bounded window is loaded
