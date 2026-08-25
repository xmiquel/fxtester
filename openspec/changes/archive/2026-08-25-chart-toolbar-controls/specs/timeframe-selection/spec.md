# Delta for timeframe-selection

## MODIFIED Requirements

### Requirement: API exposes available timeframes

The system MUST expose `GET /timeframes` as a JSON array containing the supported case-sensitive units and catalog values. The catalog MUST include valid seeded values for `m`, `h`, and `d`, and MUST identify `w` and `M` as supported units.
(Previously: the endpoint returned only `1m`, `5m`, `15m`, and `1h`.)

#### Scenario: Catalog is requested
- GIVEN the backend is running
- WHEN a client sends `GET /timeframes`
- THEN the response is JSON and includes `1m`, `5m`, `15m`, `1h`, and `1d`

#### Scenario: Unit case is preserved
- GIVEN the catalog contains month support
- WHEN the response is serialized
- THEN month uses `M` and minute uses `m`, without case normalization

### Requirement: Toolbar selects a favorite timeframe

The system MUST provide a chart toolbar that renders favorite timeframe buttons and a management control. Selecting a favorite MUST report its exact string and replace the native select-only interaction.
(Previously: `TimeframeSelector` rendered a controlled native `<select>`.)

#### Scenario: Select favorite
- GIVEN favorites include `5m` and `1h`
- WHEN the user activates `1h`
- THEN the selected timeframe becomes exactly `1h`

#### Scenario: Manage list
- GIVEN the toolbar is rendered
- WHEN the user opens management
- THEN available values and star/unstar controls are exposed

### Requirement: Toolbar is accessible

The toolbar and management UI MUST have accessible names, MUST expose favorite state, and MUST be operable by keyboard alone.
(Previously: only the native select required a Timeframe label and keyboard operation.)

#### Scenario: Keyboard management
- GIVEN management is focused
- WHEN the user navigates and activates a star control
- THEN the favorite state changes without pointer input

#### Scenario: Screen reader state
- GIVEN a screen reader focuses a timeframe control
- WHEN it announces the control
- THEN its name and selected or favorite state are available

### Requirement: Timeframe change resets candle pagination

Changing the selected timeframe MUST produce a distinct React Query cache key, isolate cursor state per timeframe, hide old candles while the new timeframe loads, and start from the latest bucket boundary.
(Previously: this behavior applied to the select-driven four-value list.)

#### Scenario: Switch timeframe
- GIVEN candles are loaded at `1m` with a cursor
- WHEN the user selects `1h`
- THEN a fresh `1h` query starts and old `1m` candles are not displayed
