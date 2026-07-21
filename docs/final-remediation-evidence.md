# Final remediation evidence

This record is the independently reviewable final evidence for the PR 2 remediation. It does not
alter the archived verification report: that report accurately records that Semgrep was unavailable
in its original environment.

## Semgrep CE

| Item | Evidence |
|---|---|
| Command | `uvx --from semgrep==1.144.0 semgrep scan --config p/python --error --strict backend` |
| Scope | `backend` |
| Expected result | Exit code `0` and zero findings; scan/configuration errors fail because of `--error --strict` |
| CI gate | `.github/workflows/ci.yml` runs the identical pinned command in the backend job |
| Final execution | 2026-07-21: exit code `0`; Semgrep reported `0` findings across 6 Python targets using 151 rules |

## Compose proxy contract

The CI Compose gate creates a seeded temporary read-only DuckDB, starts the backend and Vite
frontend, requests `http://127.0.0.1:5173/api/candles`, and requires HTTP 200 plus `OPEN`, `high`,
`low`, and `close` candle fields. This proves the deployed proxy path rather than only the backend
or mocked browser path.

Final local execution on 2026-07-21 returned HTTP `200` with
`datetime,symbol,OPEN,high,low,close,tickvol,volume,spread,origen,fecha_carga`; the backend mount
was confirmed as `RW=false`. The temporary database and Compose stack were removed afterward.

## Historical boundary

`openspec/changes/archive/2026-07-20-trading-terminal-foundation/verify-report.md` remains the
historical record. Its unavailable-Semgrep warning is intentionally preserved; this document and
the CI gate provide the final, reproducible evidence.

## Final resilience and readiness follow-up

| Check | Result |
|---|---|
| Production pagination coverage | Vitest renders `CandlestickChart`, which uses `useCandleWindow`, across four cursor windows and proves the oldest page is evicted after three retained pages. |
| Retry recovery | Vitest and Playwright prove an initial 500 exposes an accessible retry action that recovers the query. They also prove an older-window 503 keeps the rendered chart visible, exposes a `role="alert"` retry action, and merges the retry result. |
| Client and API observability baseline | Browser non-2xx responses, transport failures, JSON parse failures, and unhandled errors/rejections POST a bounded message and current path to the self-hosted `/client-events` endpoint; backend stdout emits `client_observability` events. Request URLs and response bodies are not included. Candle requests emit `candle_request` records with status and duration. This intentionally limited first slice has no Prometheus, Alertmanager, `/metrics` endpoint, alert rules, or alert routing. |
| Baseline validation | 2026-07-21: backend `pytest --cov=app --cov-fail-under=80` passed (15 tests, 92.76%); frontend Vitest (11 tests), production build, ESLint, Compose config, and a rebuilt Compose browser check (1 test) passed. |
| Focused-test protection | CI enables `forbidOnly` for Vitest and for both standard and Compose Playwright configurations, so each browser gate rejects committed focused tests. |
| Compose functional execution | 2026-07-21: a CI-equivalent local run created a temporary two-candle DuckDB fixture, mounted it read-only, rebuilt the Compose services, and passed `npm exec --prefix frontend playwright test -- --config frontend/playwright.compose.config.ts` (1 passed). The test observes the real proxied `/api/candles` response, validates its non-empty NDX/1m OHLC contract, and confirms the rendered chart contains those response datetimes without assuming a source timestamp. |
| Source immutability | The same local run confirmed the bind mount as `RW=false`, rejected a backend write with `OSError: [Errno 30] Read-only file system`, and preserved the temporary fixture SHA-256. CI executes the equivalent check. |

The intentionally limited structured-log and runtime-check baseline is documented in
[operations](operations.md#observability-baseline).
