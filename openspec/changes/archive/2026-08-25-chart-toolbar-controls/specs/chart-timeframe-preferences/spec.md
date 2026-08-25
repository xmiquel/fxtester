# chart-timeframe-preferences Specification

## Purpose

Define single-chart timeframe preferences, management, ordering, validation, and browser persistence.

## Requirements

### Requirement: Seed and order chart timeframes

The system MUST initialize available and favorite values to exactly `1m`, `3m`, `5m`, `15m`, `1h`, `3h`, `4h`, and `1d`. Favorites MUST be ordered by case-sensitive unit order `m`, `h`, `d`, `w`, `M`, then positive integer ascending.

#### Scenario: Initial toolbar
- GIVEN a chart has no stored preferences
- WHEN the toolbar initializes
- THEN those eight values are available and favorite in the specified order

#### Scenario: Mixed custom ordering
- GIVEN favorites contain `2M`, `1w`, `15m`, and `3h`
- WHEN favorites render
- THEN they render as `15m`, `3h`, `1w`, `2M`

### Requirement: Manage favorites and custom values

The management UI MUST support starring and unstarring available values. It MUST accept only positive-integer tokens using one case-sensitive unit from `m`, `h`, `d`, `w`, or `M`; a valid new token MUST immediately become available and favorite.

#### Scenario: Add valid custom timeframe
- GIVEN management is open
- WHEN the user adds `7m`
- THEN `7m` is immediately available and favorite

#### Scenario: Reject invalid token
- GIVEN management is open
- WHEN the user submits `0m`, `-1h`, `1H`, or `1mm`
- THEN the value is rejected and preferences do not change

### Requirement: Persist chart-scoped preferences safely

The system MUST persist available and favorite preferences in browser storage keyed by chart identity. It MUST recover defaults and reconcile invalid, duplicate, or stale values without preventing chart startup. Preferences MUST NOT be shared across chart identities.

#### Scenario: Restore preferences
- GIVEN chart A has stored a valid custom favorite
- WHEN chart A initializes again
- THEN its available and favorite values are restored

#### Scenario: Malformed or stale storage
- GIVEN storage contains malformed JSON, duplicates, invalid tokens, or unavailable favorites
- WHEN the chart initializes
- THEN safe valid preferences are retained, invalid entries are discarded, and initialization completes
