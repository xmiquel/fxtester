# Delta for candlestick-terminal

## ADDED Requirements

### Requirement: Render the single-chart symbol selector

The single-chart terminal MUST render the reusable symbol selector in the chart toolbar before favorite timeframe controls. Selecting a symbol MUST preserve the existing explicit symbol request and timeframe behavior. This change MUST NOT introduce multi-chart creation, synchronization, differing-timeframe mapping, or missing-candle behavior.

#### Scenario: Toolbar placement and selection
- GIVEN the single-chart terminal has a loaded symbol catalog and favorite timeframe controls
- WHEN the toolbar renders and the user selects a symbol
- THEN the symbol selector appears before the timeframe controls and the chart requests the selected symbol using the existing backend contract

#### Scenario: Symbol change resets the active view
- GIVEN candles are loaded for symbol `AAPL` at a selected timeframe
- WHEN the user selects `MSFT`
- THEN the terminal displays the new symbol's loading or empty state and does not continue presenting `AAPL` candles as the active result

#### Scenario: Scope remains single-chart
- GIVEN the terminal is used with one chart
- WHEN a symbol is selected
- THEN no additional chart is created and no cross-chart synchronization or timeframe mapping occurs
