# searchable-symbol-selector Specification

## Purpose

Define the reusable accessible symbol selector used by Market Data and Backtest.

## Requirements

### Requirement: Search and select catalog symbols

The system MUST expose the existing symbol catalog through a controlled visual trigger and popover. Filtering MUST be case-insensitive substring matching, and displayed results MUST be alphabetically ordered.

#### Scenario: Filter symbols
- GIVEN the catalog contains `AAPL`, `BTCUSD`, and `ETHUSD`
- WHEN the user enters `usd`
- THEN `BTCUSD` and `ETHUSD` are displayed in alphabetical order

#### Scenario: No matching symbols
- GIVEN the catalog contains no symbol matching the filter
- WHEN the user enters a non-matching query
- THEN an explicit empty-result state is displayed

### Requirement: Accessible selector interaction

The selector MUST expose an accessible name, MUST support keyboard-only opening, filtering, selection, and dismissal, and MUST manage focus so the trigger and popover remain operable.

#### Scenario: Keyboard selection
- GIVEN the selector trigger is focused
- WHEN the user opens the popover, navigates results, and activates one
- THEN the selected symbol changes and focus returns to an operable selector control

#### Scenario: Dismiss without selection
- GIVEN the popover is open
- WHEN the user dismisses it without selecting a result
- THEN the current symbol remains unchanged and the popover closes

### Requirement: Reuse controlled selection flows

Market Data and Backtest MUST reuse the selector. Backtest MUST remain parent-controlled through its existing selection boundary and MUST NOT implicitly read or write chart preference storage.

#### Scenario: Backtest selection
- GIVEN Backtest supplies a selected symbol and selection callback
- WHEN the user selects another symbol
- THEN the callback receives that symbol and Backtest state remains the source of truth

#### Scenario: Catalog loading state
- GIVEN the existing catalog query is loading or unavailable
- WHEN the selector is rendered
- THEN it remains usable without adding a symbol-list backend contract
