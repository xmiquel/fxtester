# Design: Chart Toolbar Controls

## Technical Approach

Keep symbol/timeframe ownership in `App` and keep the existing React Query key boundary. Replace only the market-data select with a candle-feature toolbar backed by a chart-identity preference store. Validate and reconcile preferences before rendering; persist only validated state. Extend the candle parser and DuckDB repository for case-sensitive fixed and calendar buckets, without timezone conversion.

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|---|---|---|---|
| Chart identity and persistence | Add `chartTimeframePreferences.ts` with versioned `localStorage` keys `chart-timeframe-preferences:{chartId}`; App passes a stable primary-chart id. | App-only state; symbol-only keys | Encapsulates recovery and prevents future charts from sharing state; symbol changes do not unexpectedly reset preferences. |
| Preference validation/order | Use one case-sensitive token parser (`^[1-9][0-9]*[mhdwM]$`), deduplicate, reconcile favorites against available values, and sort by `m,h,d,w,M` then amount. | Case normalization; backend order | Preserves the hard `m`/`M` contract and gives deterministic UI/API behavior. |
| Calendar aggregation | Use DuckDB expressions anchored to raw `datetime`: fixed epoch buckets for `m/h`, calendar day/week/month anchors for `d/w/M`, with Monday week boundaries and period arithmetic for amounts. | Python conversion; UTC/local conversion | Keeps NY/DST market timestamps unchanged and makes boundary behavior executable in DuckDB. |

## Data Flow

```text
GET /timeframes ─→ catalog reconciliation ─→ chart preference store ─→ ChartToolbar
                                                               │
favorite/custom click ─→ App selectedTimeframe ─→ query key(symbol, exact token)
                                                               │
                                      /candles ─→ parser/catalog ─→ DuckDB raw buckets ─→ chart
```

The toolbar exposes favorite buttons plus a manage dialog/panel. Manage lists available tokens with star/unstar buttons and a custom-token form. Controls use real buttons, `aria-pressed`/selected state, labelled regions, focus return on close, and keyboard-only operation. Invalid storage or storage failures fall back to seeded defaults without blocking startup. A valid custom token is immediately added to available and favorites; backend capability validation remains authoritative when the request is made.

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/features/candles/chartTimeframePreferences.ts` | Create | Token type, seed defaults, comparator, validation, reconciliation, storage read/write, and chart-id key. |
| `frontend/src/features/candles/ChartToolbar.tsx` | Create | Favorite toolbar and accessible manage/custom interaction. |
| `frontend/src/App.tsx` | Modify | Own preference state and exact selected token; render toolbar for market data only. |
| `frontend/src/features/candles/useTimeframes.ts` | Modify | Case-sensitive `m/h/d/w/M` types, seeds, and catalog policy. |
| `frontend/src/styles.css` | Modify | Toolbar/manage layout and responsive/focus styling. |
| `backend/app/features/candles/window.py` | Modify | Strict parser, catalog, calendar bucket SQL, cursor normalization, and error contract. |
| `frontend/tests/candles/chartTimeframePreferences.test.ts`, `ChartToolbar.test.tsx`, `App.test.tsx` | Create/modify | State, recovery, ordering, accessibility, selection, and query isolation evidence. |
| `backend/tests/test_candles.py` | Modify | Case rejection, catalog, DST/boundary, calendar aggregation, pagination, and raw timestamp assertions. |

## Interfaces / Contracts

```ts
type TimeframeUnit = "m" | "h" | "d" | "w" | "M";
type ChartTimeframePreferences = { available: string[]; favorites: string[] };
type ChartToolbarProps = {
  chartId: string; preferences: ChartTimeframePreferences;
  selectedTimeframe: string; onSelect(token: string): void;
  onChange(next: ChartTimeframePreferences): void;
};
```

`parse_timeframe` returns the exact token and bucket semantics or `None`; `1H`, `1W`, malformed, zero, signed, and decimal tokens produce the existing typed HTTP 400. Calendar queries group by raw `datetime` anchors and retain the 1000-row bound and exact symbol/timeframe cursor isolation.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Comparator, validation, duplicate/stale recovery, storage exceptions | Vitest with mocked `localStorage`; boundary amounts and wrong-case tokens. |
| Integration | DuckDB day/week/month boundaries, DST-adjacent raw timestamps, parser/catalog, pagination | Pytest temporary DuckDB fixtures; assert no timezone-shifted bucket and max 1000 rows. |
| E2E/UI | Keyboard manage/star/custom flows, focus/accessibility, timeframe switch | Testing Library plus Playwright/MSW; assert old query data is hidden and requests retain exact token and symbol. |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Roll back frontend/backend changes and the versioned preference key; retain the current selector and aggregation baseline, without touching `multiple-synchronized-charts`.

## Open Questions

- [ ] None blocking; confirm the API catalog’s finite seeded entries remains the capability list while arbitrary valid custom tokens are parser-validated on request.
