# PR 2 release summary

This approved `size:exception` delivers the PR 2 chart slice and its focused review remediation.
The accumulated PR 2 review set is **52 files, 6,523 additions, and 550 deletions** after removing
out-of-scope metrics and alert-routing infrastructure. Review handwritten behavior first; do not
spend review budget on regenerated output.

## Size-exception review boundary

| Boundary | Review instruction |
|---|---|
| Approved exception | The change exceeds the 400-line target because it combines the initial PR 2 delivery with focused, autonomous remediation. No product scope was added by the remediation. |
| Generated output | `frontend/package-lock.json` and `backend/openapi.json` / `frontend/src/api/generated.ts` are generated. Review their source manifests and the CI drift command, not every generated line. |
| Handwritten review | Focus on `backend/app/`, `frontend/src/`, tests, Compose, CI, and operational/release evidence. |
| Verification boundary | Backend tests, frontend unit/build/lint/E2E checks, Compose validation, and Semgrep are the relevant gates. |

## Historical PR 2 implementation snapshot (superseded)

- One NDX `1m` Lightweight Charts view with navigation-triggered older windows.
- TanStack Query retains at most three pages; chart coverage exercises the production hook and proves oldest-window eviction.
- A transient initial or older-window failure exposes an accessible retry action. Older-window failures retain the rendered chart; chart tests verify recovery, `setData`, and cleanup.

## Current paging and retention behavior

The current implementation supersedes the historical snapshot above: it uses 1000-candle pages, pointer-gated prefetch near the oldest loaded range, persistent chart and visible-range state while older pages prepend, and retains loaded pages up to 20,000 candles per active symbol/timeframe query. No page eviction occurs below that cap; once the cap branch applies, another older request is not made and an accessible status is shown.

## Generated OpenAPI output

- `backend/openapi.json` is exported deterministically.
- `frontend/src/api/generated.ts` is regenerated from that contract.
- The `/candles` OpenAPI operation documents its 400 unsupported-symbol/timeframe response.

## Archive and delivery record

- The archived exploration is historical planning: it records that PR 2 was then unimplemented.
  Subsequent PR 2 remediation delivered the feature; the exploration file does not claim delivery.
- Canonical specs and the delivery/evidence records state that PR 2 is delivered.
- Historical unavailable-Semgrep evidence remains labeled as historical; it is not the final result.

## Test and CI evidence

- CI rejects focused Vitest tests and focused Playwright tests in both the standard browser suite and the Compose browser suite (`forbidOnly` is CI-aware in all three configurations).
- CI pins Semgrep and fails on findings or scan errors.
- Unit/E2E tests cover transport, response, and JSON parse request failures; bounded pagination through the production hook; retryable initial and older-window failures; and chart lifecycle.
- CI validates the frontend Docker context excludes local secrets and artifacts.
- CI runs Playwright against the Compose containers to prove React renders the seeded proxied candle API; it also proves a container write is rejected and the source SHA is unchanged.
- Observability is intentionally limited to structured application logs, `/health`, `/ready`, and
  backend/frontend/Compose runtime checks; this slice has no metrics endpoint, alert rules, or
  alert routing.
