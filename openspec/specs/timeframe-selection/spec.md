# timeframe-selection Specification

## Purpose

Define the TimeframeSelector UI component that lets users switch between aggregation intervals, and the `/timeframes` API endpoint that supplies the available options.

## Requirements

### Requirement: API exposes available timeframes

The system MUST expose a `GET /timeframes` endpoint that returns `["1m", "5m", "15m", "1h"]`. The response MUST be a JSON array of strings.

#### Scenario: Timeframes are requested

- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN the response body is `["1m", "5m", "15m", "1h"]`
- AND the Content-Type is `application/json`

### Requirement: TimeframeSelector is a controlled select

The system MUST provide a `TimeframeSelector` component with `value` and `onChange` props. It MUST render a native `<select>` element with one `<option>` per supported timeframe. When the user selects a different option, `onChange` MUST fire with the new timeframe string.

#### Scenario: Selector renders all timeframes

- GIVEN the component receives `value="5m"` and the timeframe list
- WHEN the component renders
- THEN the `<select>` contains options for "1m", "5m", "15m", "1h"
- AND the "5m" option is selected

#### Scenario: User selects a different timeframe

- GIVEN the selector is rendered with `value="1m"`
- WHEN the user selects "1h" from the dropdown
- THEN `onChange` is called with `"1h"`

### Requirement: TimeframeSelector is accessible

The `<select>` element MUST have an associated `<label>` with the text "Timeframe". The component MUST be operable via keyboard alone.

#### Scenario: Keyboard navigation works

- GIVEN the selector is focused
- WHEN the user presses the Down Arrow key
- THEN focus moves to the next option

#### Scenario: Screen reader announces label

- GIVEN a screen reader is active
- WHEN the selector is focused
- THEN the label "Timeframe" is announced

### Requirement: Timeframe change resets candle pagination

Changing the selected timeframe MUST produce a distinct React Query cache key, isolating cursor state per timeframe. Previously loaded candles for the old timeframe MUST NOT be visible while the new timeframe loads.

#### Scenario: Timeframe switch clears old candles

- GIVEN candles are loaded at "1m" with a cursor position
- WHEN the timeframe changes to "1h"
- THEN React Query issues a fresh query with a different cache key
- AND the old "1m" candles are not displayed
- AND cursor state starts from the latest bucket boundary

### Requirement: Timeframes fetched on mount with fallback

The component MUST fetch available timeframes from `GET /timeframes` via React Query on mount. The query SHOULD have a stale time of at least 5 minutes. If the fetch fails, the component MUST fall back to `["1m", "5m", "15m", "1h"]` and log the error.

#### Scenario: Fetch succeeds

- GIVEN the component mounts
- WHEN the `GET /timeframes` request completes
- THEN the select populates with the API response values

#### Scenario: Fetch fails with network error

- GIVEN the component mounts
- WHEN the `GET /timeframes` request fails
- THEN the select populates with the hardcoded fallback `["1m", "5m", "15m", "1h"]`
- AND the error is logged to the console
- AND no error toast is shown to the user
