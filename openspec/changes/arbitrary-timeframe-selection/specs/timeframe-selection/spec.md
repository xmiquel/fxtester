# Delta for timeframe-selection

## MODIFIED Requirements

### Requirement: API exposes available timeframes

The system MUST expose `GET /timeframes` as a JSON array of finite quick-discovery options: `1m`, `2m`, `5m`, `15m`, and `1h`. The catalog MUST NOT be treated as exhaustive; any valid positive-integer `m` or `h` token is selectable.
(Previously: The endpoint returned only `1m`, `5m`, `15m`, and `1h` as the supported set.)

#### Scenario: Timeframes are requested
- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN the response body is `['1m', '2m', '5m', '15m', '1h']`
- AND the Content-Type is `application/json`

### Requirement: TimeframeSelector is a controlled select

The system MUST provide a controlled native `<select>` with `selectedTimeframe`, `timeframes`, and `onSelect` behavior. It MUST render one option per catalog entry and MUST prepend the selected value when it is a valid custom token absent from the finite catalog. A selection MUST emit the selected canonical token.
(Previously: The selector exposed `value` and `onChange` and rendered only listed supported options.)

#### Scenario: Selector renders all timeframes
- GIVEN the component receives `selectedTimeframe='5m'` and the catalog
- WHEN the component renders
- THEN the select contains `1m`, `2m`, `5m`, `15m`, and `1h`
- AND `5m` is selected

#### Scenario: Custom selection remains visible
- GIVEN the selected timeframe is `37m` and it is absent from the catalog
- WHEN the component renders
- THEN `37m` is an option and is selected

#### Scenario: User selects a different timeframe
- GIVEN the selector is rendered with `selectedTimeframe='1m'`
- WHEN the user selects `1h` from the dropdown
- THEN `onSelect` is called with `1h`

### Requirement: TimeframeSelector is accessible

The `<select>` MUST have the associated label `Timeframe`, remain keyboard-operable, and expose instructions that arbitrary positive-integer `m`/`h` tokens can be typed; keyboard switching MUST be disabled in editable controls.
(Previously: Accessibility covered only native option navigation and the label.)

#### Scenario: Keyboard navigation works
- GIVEN the selector is focused
- WHEN the user presses the Down Arrow key
- THEN focus moves to the next option

#### Scenario: Screen reader announces label
- GIVEN a screen reader is active
- WHEN the selector is focused
- THEN the label `Timeframe` is announced

### Requirement: Timeframe change resets candle pagination

Changing any selected timeframe MUST produce an isolated query identity, clear old candles while the new timeframe loads, and start from the latest bucket boundary.
(Previously: This behavior was specified only for the fixed `1m` and `1h` options.)

#### Scenario: Timeframe switch clears old candles
- GIVEN candles are loaded at `1m` with a cursor position
- WHEN the timeframe changes to `37m`
- THEN a fresh query is issued, old `1m` candles are hidden, and loading starts at the latest `37m` bucket

### Requirement: Timeframes fetched on mount with fallback

The component MUST fetch the finite catalog on mount, MAY cache it for at least five minutes, and MUST retain the fallback `['1m', '2m', '5m', '15m', '1h']` if the request fails without showing a user toast.
(Previously: The fallback omitted `2m` and the catalog was presented as exhaustive.)

#### Scenario: Fetch succeeds
- GIVEN the component mounts
- WHEN `GET /timeframes` completes
- THEN the select populates with the response values

#### Scenario: Fetch fails with network error
- GIVEN the component mounts
- WHEN `GET /timeframes` fails
- THEN the select uses the five-value fallback
- AND the error is reported through client observability
- AND no error toast is shown

## ADDED Requirements

### Requirement: Keyboard timeframe tokens are buffered and bounded by context

The system MUST accept case-insensitive tokens matching `^[1-9][0-9]*[mh]$` with no numeric upper bound. Invalid or incomplete prefixes MUST leave the selection unchanged; completed tokens MUST select immediately after the unit key. Input MUST expire after one second and MUST NOT intercept default-prevented events or events with Ctrl, Alt, or Meta modifiers.

#### Scenario: Arbitrary token is selected
- GIVEN the chart is focused and no modifier is pressed
- WHEN the user types `3H`
- THEN the selected timeframe becomes canonical `3h`

#### Scenario: Invalid or incomplete input is ignored
- GIVEN the current selection is `5m`
- WHEN the user types `0`, `2h` with an invalid prefix, or only `7`
- THEN the selection remains `5m`

#### Scenario: Form controls and modifiers retain normal behavior
- GIVEN focus is in an input, select, textarea, or contenteditable element, or a modifier is pressed
- WHEN a timeframe-looking key is pressed
- THEN no timeframe changes and the event is not intercepted
