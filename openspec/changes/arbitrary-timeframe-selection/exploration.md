## Exploration: Arbitrary timeframe selection

### Current State
The later, already-implemented extension generalizes TradingView-style keyboard timeframe
switching and candle aggregation from the archived `timeframe-selector` preset feature to any
positive integer followed by `m` or `h` (for example `6m` and `3h`). This is an implementation
documentation change, not a new capability proposal.

On the frontend, `useTimeframeKeyboard` accepts a strict case-insensitive token matching
`^[1-9][0-9]*[mh]$`, builds input incrementally, commits when the unit key is entered, clears
incomplete input after 1000 ms, and ignores editable controls or modified/default-prevented
events. `TimeframeSelector` remains a controlled native select: `/timeframes` supplies finite
preset options (`1m`, `2m`, `5m`, `15m`, `1h`), while a custom keyboard-selected value is
prepended temporarily so the selected value remains representable. `App` passes the selected
token through to the candle query and chart.

At the API boundary, `/candles?timeframe=` accepts the same positive-integer minute/hour
grammar case-insensitively and returns a lowercase canonical token. `1m` preserves source-row
and cursor semantics. Every other token is converted to an integer bucket size in seconds,
aggregated with epoch-floor buckets, and reduced as first open, maximum high, minimum low, last
close, summed tickvol/volume, last spread/origen, and maximum fecha_carga. Aggregate cursors are
normalized to UTC and down to the requested bucket boundary before the exclusive source filter;
pages are chronological, non-overlapping, and capped at 1000 candles per response.

The live specs still describe the earlier fixed-preset contract: `timeframe-selection` and
`terminal-foundation` list only `1m`, `5m`, `15m`, and `1h`, reject `2h`, and expect a four-item
`/timeframes` response; `candlestick-terminal` describes only those four aggregation intervals.
The archived change at `openspec/changes/archive/2026-07-27-timeframe-selector/` remains the
historical source for introducing preset selection and must not be conflated with this later
arbitrary-interval extension.

### Affected Areas
- `frontend/src/features/candles/useTimeframeKeyboard.ts` — arbitrary token grammar, buffered keyboard input, timeout, and form-control boundary.
- `frontend/src/features/candles/TimeframeSelector.tsx` — controlled-select representation of values not present in the finite preset list.
- `frontend/src/features/candles/useTimeframes.ts` — finite fallback/preset catalog remains separate from accepted arbitrary tokens.
- `frontend/src/App.tsx` and `frontend/src/features/candles/api.ts` — selected token propagation and `/candles` query transport.
- `frontend/src/features/candles/useCandleWindow.ts` and `CandlestickChart.tsx` — per-timeframe query identity, retained pages, chart reload, labels, and cursor-history behavior.
- `backend/app/features/candles/window.py` — strict parsing/canonicalization, dynamic bucket arithmetic, aggregation, and cursor normalization.
- `frontend/tests/candles/useTimeframeKeyboard.test.tsx`, `TimeframeSelector.test.tsx`, `App.test.tsx` — arbitrary-token, custom-option, end-to-end UI, and keyboard-boundary coverage.
- `backend/tests/test_candles.py` — invalid-token rejection, arbitrary `3h` aggregation, epoch-floor behavior, pagination, timezone normalization, and unchanged `1m` semantics.
- `openspec/specs/timeframe-selection/spec.md` — **modified capability** for keyboard input, custom selected options, and the distinction between preset discovery and arbitrary acceptance.
- `openspec/specs/terminal-foundation/spec.md` — **modified capability** for the API grammar, dynamic aggregation, canonical response token, and generalized cursor semantics.
- `openspec/specs/candlestick-terminal/spec.md` — **modified capability** because rendered candles, labels, reloads, and retained history now apply to arbitrary accepted intervals.

### Approaches
1. **Three-capability delta** — update `timeframe-selection`, `terminal-foundation`, and `candlestick-terminal` with deltas for their separate frontend selector, backend/API, and chart responsibilities.
   - Pros: preserves existing capability boundaries; makes the full cross-stack behavior traceable; avoids claiming `/timeframes` is an exhaustive accepted-token list.
   - Cons: repeats the shared token grammar and compatibility language across three specs.
   - Effort: Medium

2. **Single capability delta** — document the extension only under `timeframe-selection` and reference backend/chart behavior informally.
   - Pros: smaller proposal and less repeated wording.
   - Cons: leaves live backend and chart requirements factually stale; weakens traceability for aggregation and cursor correctness.
   - Effort: Low

### Recommendation
Use the three-capability delta. The prior archived change already established the boundaries:
`timeframe-selection` owns selection and `/timeframes` discovery, `terminal-foundation` owns
`/candles` validation/aggregation/cursors, and `candlestick-terminal` owns rendering and history
navigation. The proposal should explicitly state that `/timeframes` remains a finite preset
catalog, while `/candles` and keyboard switching accept the broader positive-integer grammar.
Preserve `1m` as the compatibility boundary and retain the archived change as historical context,
not as the source of this extension.

### Risks
- The existing live specs contain contradictory fixed-preset and invalid-`2h` scenarios; a proposal must replace those scenarios rather than append ambiguous exceptions.
- Very large positive integers are syntactically accepted but may create impractically large bucket intervals or overflow downstream numeric/date operations; the current code has no explicit upper bound.
- The frontend TypeScript template type `${number}${TimeframeUnit}` is broader than the runtime positive-integer grammar; proposal wording should treat runtime validation as authoritative unless a type-tightening decision is made.
- `/timeframes` is intentionally not exhaustive. Consumers that validate arbitrary tokens only against its response would remain incompatible.
- Current worktree changes are uncommitted implementation changes; this exploration does not verify a clean patch or alter them.

### Proposal Questions / Assumptions
- **Assumption for proposal:** arbitrary acceptance is intentionally broader than `/timeframes`; no product requirement currently asks the preset endpoint to enumerate every possible interval.
- **Question to resolve before proposal finalization:** should the product define a maximum numeric interval, or is the current unbounded positive-integer grammar the intended contract?
- **Assumption for proposal:** uppercase input is accepted at both keyboard and API boundaries but canonicalized to lowercase in selection/API state and responses.

### Ready for Proposal
Yes, after the orchestrator confirms the maximum-interval question (or records the decision to
preserve the current unbounded grammar). The proposal should target the three live capabilities
above and explicitly exclude re-opening or modifying the archived `timeframe-selector` change.
