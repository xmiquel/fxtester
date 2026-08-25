# Delta for candlestick-terminal

## MODIFIED Requirements

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
