## Exploration: Chart toolbar controls

### Current State
The clean checkout has one market-data chart owned by `frontend/src/App.tsx`. App-level state owns the selected symbol and timeframe; `TimeframeSelector` is a native `<select>` above `CandlestickChart`; and the React Query candle key is isolated by symbol/timeframe, so changing either selection reloads the chart.

`useTimeframes` fetches `/timeframes` and falls back to `1m`, `2m`, `5m`, `15m`, `1h`. There is no toolbar state model, favorite management, browser persistence, or chart identity. The current keyboard path accepts only case-insensitive `m`/`h` tokens. The backend exposes read-only `/timeframes`, and `parse_timeframe` accepts only positive integer `m`/`h` tokens; its regex is case-insensitive and normalizes units to lowercase. Consequently, `1d`, `1w`, and `1M` cannot currently load candles, while arbitrary `m`/`h` values such as `7m` can be requested. The backend preset bucket map also contains only the existing five values.

First-slice feasibility: favorite ordering, default seeding, star/unstar UI, custom-token validation, browser persistence, and per-chart keying can be implemented frontend-only. However, end-to-end selection of the required seeded `1d` value—and any future `d`, `w`, or case-sensitive `M` custom value—has a backend/contract gap. Showing those values frontend-only would produce a selectable control followed by `/candles` 400 responses. The `/timeframes` response also cannot currently describe user-specific available/favorite state, so persisted choices must remain client-owned unless a later server contract is introduced. Existing chart/API/App tests cover current controls, but no tests cover a composed toolbar, persistence, ordering, or custom-token management.

Historical `tradingview-chart-controls` artifacts describe a larger failed attempt and are not treated as requirements. The unrelated `multiple-synchronized-charts` exploration remains untouched and is out of scope.

### Affected Areas
- `frontend/src/App.tsx` — retain selection ownership and introduce available/favorite state keyed for the current chart, then compose the toolbar in the single-chart market-data path.
- `frontend/src/features/candles/TimeframeSelector.tsx` — replace the select-only presentation with sorted favorites, a TradingView-like manage button/popover, star toggles, and validated custom-token input while preserving controlled selection.
- `frontend/src/features/candles/useTimeframes.ts` — seed the required available/default set, apply case-sensitive unit ordering (`m`, `h`, `d`, `w`, `M`) plus numeric ascending order, and reconcile API values without losing persisted custom values.
- `frontend/src/features/candles/timeframePreferences` (new frontend state/persistence module) — validate positive-integer tokens, deduplicate choices, isolate browser storage per chart, and recover safely from malformed localStorage.
- `frontend/src/features/candles/api.ts` and generated API types — verify whether `/timeframes` remains a server preset catalog only; no favorite mutation endpoint exists.
- `frontend/src/styles.css` — add compact toolbar, manage popover, star/focus states, validation feedback, and responsive behavior.
- `frontend/tests/App.test.tsx`, `frontend/tests/candles/TimeframeSelector.test.tsx`, and focused preference/sorting tests — cover ordering, seed defaults, star/unstar, custom add/favorite, persistence, malformed storage, and chart query selection.
- `backend/app/features/candles/window.py` — expand parsing, bucket/aggregation semantics, supported catalog, and case-sensitive validation if `d`, `w`, or `M` must actually render candles; current code is insufficient.
- `backend/tests/test_candles.py` and API contract tests — add evidence for required timeframe tokens and reject wrong-case units once the backend contract is corrected.

### Approaches
1. **Frontend preferences plus backend timeframe contract** — keep favorites/available choices in a per-chart browser store, render the required sorted favorites and manage UI in React, and extend the candle contract for case-sensitive `m`, `h`, `d`, `w`, and `M` values.
   - Pros: all required seeded values are genuinely selectable; persistence is client-owned and ready for N charts; preserves the existing query boundary.
   - Cons: calendar day/week/month aggregation and API catalog semantics require backend design and tests; larger than a UI-only change.
   - Effort: High

2. **Frontend-only toolbar with deferred unsupported values** — implement the complete preference UI and store, but treat backend-unsupported values as display-only or fail with an explicit unavailable state.
   - Pros: smallest immediate code change; no backend migration or aggregation work.
   - Cons: violates the expected behavior of selecting the required seeded set; creates a misleading control and cannot honestly claim `1d` support.
   - Effort: Medium

### Recommendation
Proceed with approach 1, but split the proposal explicitly into a frontend preference/UI slice and the minimal backend contract needed for real selection. The frontend should own per-chart available and favorite arrays, seed `1m`, `3m`, `5m`, `15m`, `1h`, `3h`, `4h`, `1d`, sort favorites by the exact case-sensitive unit order then numeric period, and persist only validated positive-integer tokens. A chart-id abstraction should exist even though the current app has one chart. The manage UI should expose star/unstar for defaults and added values, and adding `7m` should immediately make it available and favoritable. Keep `selectedSymbol` and `selectedTimeframe` in `App` and preserve the existing query key.

Do not recommend a frontend-only implementation as complete until the backend accepts and aggregates every required seeded token. The proposal must either include backend support for `d`, `w`, and case-sensitive calendar `M`, or state that those tokens are intentionally unavailable and revise the acceptance claim; the user-approved scope makes the former the coherent recommendation.

### Risks
- Case-sensitive `M` conflicts with the current case-insensitive parser, which currently converts it to minute semantics; accepting it safely requires an explicit backend contract and calendar-month aggregation rule.
- Calendar day/week/month boundaries, timezone, incomplete buckets, and multi-period behavior are backend correctness decisions, not presentational details.
- Browser storage is untrusted: malformed JSON, duplicate tokens, invalid units, and schema migrations must not break chart startup.
- Per-chart persistence needs a stable chart identity API before N charts exist; using a global key would make later charts overwrite one another.
- Replacing the native select can regress keyboard and screen-reader behavior; tests must cover manage-button focus, Escape/outside handling, star labels, and validation feedback.
- Backend `/timeframes` is global and read-only, so it cannot represent per-chart favorites without a new contract; mixing server presets with local choices needs deterministic reconciliation.
- The unrelated `multiple-synchronized-charts` artifact must remain untouched, and the frontend/backend split may exceed the review budget if calendar aggregation is bundled into this change.

### Ready for Proposal
Yes, with the revised recommendation. The proposal should constrain UI/storage to the single current chart while introducing a chart-id boundary for future N charts, preserve the exact required defaults and ordering, and include the backend contract gap as an explicit dependency rather than hiding it. Concrete questions that still matter are: what timezone defines `d`/`w`/`M` bucket boundaries; whether `/timeframes` remains a server-supported catalog or is expanded to return all supported tokens; and whether an unsupported persisted token should remain visible with an unavailable state or be pruned. These are implementation-contract questions, not scope questions.
