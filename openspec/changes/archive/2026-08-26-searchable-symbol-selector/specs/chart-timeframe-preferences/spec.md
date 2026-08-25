# Delta for chart-timeframe-preferences

## MODIFIED Requirements

### Requirement: Persist chart-scoped preferences safely

The system MUST persist available timeframes, favorite timeframes, and the selected symbol in browser storage keyed by chart identity. It MUST recover defaults and reconcile invalid, duplicate, stale, or incompatible values without preventing chart startup. Preferences MUST NOT be shared across chart identities.
(Previously: only available and favorite timeframe preferences were persisted per chart.)

#### Scenario: Restore preferences
- GIVEN chart A has stored a valid custom favorite and selected symbol
- WHEN chart A initializes again
- THEN its available values, favorite values, and selected symbol are restored

#### Scenario: Chart isolation
- GIVEN chart A and chart B have different stored symbols
- WHEN both charts initialize
- THEN each chart restores only its own symbol and timeframe preferences

#### Scenario: Malformed or incompatible storage
- GIVEN storage contains malformed JSON, invalid entries, or an older timeframe-only preference shape
- WHEN the chart initializes
- THEN valid preferences are retained, unsupported entries use safe defaults, and initialization completes
