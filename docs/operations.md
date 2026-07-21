# Trading Terminal Operations

## Quick path

1. Confirm `D:\repos_2026\98-tstlocal\data\market.duckdb` exists.
2. Set reproducible release identifiers, then run Compose. The same mounted-source runtime
   evidence is enforced by CI:

   ```powershell
   $env:IMAGE_VERSION = "pr1-<published-git-sha>"
   $env:BUILD_REVISION = "<published-git-sha>"
   docker compose up --build
   ```

3. Confirm `curl http://localhost:8000/ready` returns HTTP 200 and `{"status":"ready"}`.
   Confirm `curl http://localhost:5173/api/candles` returns HTTP 200 with `OPEN`, `high`, `low`,
   and `close` through the frontend proxy. Run the Compose browser check below to prove React
   executes and renders that API response. Inspect backend logs for `database_health` and
   `database_readiness`, and inspect the container mount for `/data/market.duckdb` with `RW=false`.

## Failure diagnosis

| Symptom | Check | Fix |
|---|---|---|
| Compose cannot mount `/data/market.duckdb` | The host path and file permissions | Correct the bind source, then recreate the stack |
| `/health` or `/ready` returns 503 | Backend logs and DuckDB readability | Restore the file or mount a readable copy; do not make it writable |
| `/candles` returns 503 | Same database availability check | Fix the source and verify readiness before retrying |

The API writes structured JSON events through Uvicorn's container logger. `/health` emits
`database_health` and `/ready` emits `database_readiness`; both use `status=ok`/`ready` on
success and `status=unavailable` with the request path and error type on a database failure.
The typed response is `type=service_unavailable`; it does not expose arbitrary database details.
The narrowly scoped `POST /client-events` endpoint records browser `api_failure`,
`unhandled_error`, and `unhandled_rejection` events as `client_observability` JSON log records.
It is self-hosted: no browser event is sent to an external service.
Every `/candles` response also emits a `candle_request` JSON record with `status_code` and
`duration_ms`, so latency is measurable from the same backend stdout.

## Observability baseline

This first slice intentionally uses self-hosted structured application logs and runtime checks only.
It does not provide Prometheus, Alertmanager, a `/metrics` endpoint, alert rules, or alert routing.

- Probe `/health` for liveness and `/ready` for database-backed deployment readiness.
- Keep readiness success evidence with each deployment: the HTTP response and the backend log event.
- Investigate `database_unavailable`, client-observability events, and unexpected candle-request
  latency from backend stdout before restarting or changing configuration.
- Investigate source readability and the immutable mount before changing the runtime topology.

## Source safety

The Compose mount is read-only and the repository opens DuckDB with `read_only=True`. Tests create
temporary databases under the test directory, verify pagination and source bytes, and never use the
host source file.

## Public image refresh and verification

The backend image is the public `python:3.14-slim` image. To refresh it, rebuild without adding a
registry login, digest pin, or image scanner requirement:

```powershell
$env:IMAGE_VERSION = "pr1-<git-sha>"
$env:BUILD_REVISION = "<git-sha>"
docker compose build --pull backend
docker compose up --build
curl http://localhost:8000/ready
uv run --directory backend --group dev pytest --cov=app --cov-fail-under=80
```

The Dockerfile build asserts normal CPython 3.14 (not the free-threaded build) and imports DuckDB.
`/ready` must return HTTP 200 before the backend is considered usable. The Compose bind mount stays
read-only; confirm it with `docker compose config` before deploying a changed mount.

## Quality and security findings

Run the same blocking application checks as CI:

```powershell
uv run --directory backend --group dev pytest --cov=app --cov-fail-under=80
uv run --directory backend --group dev ruff check .
uv run --directory backend --group dev mypy app
uv run --directory backend --group dev pip-audit
uvx --from semgrep==1.144.0 semgrep scan --config p/python --error --strict backend
```

Treat a dependency finding from `pip-audit` or a source finding from Ruff security rules or Semgrep
as a release blocker: identify the affected package or code path, apply the minimal safe fix, and
rerun every command above. Do not bypass a failing check with a CI exception.

## Contract generation and runtime evidence

The FastAPI OpenAPI contract is checked in at `backend/openapi.json`. Generate it and the frontend
types together; CI runs this command and fails when either checked-in output drifts:

```powershell
npm run generate:api --prefix frontend
git diff --exit-code -- backend/openapi.json frontend/src/api/generated.ts
```

Historical verification could not execute Semgrep because the executable was unavailable; that is
historical context, not the current release result. The separately reviewable final command and
result are recorded in [final remediation evidence](final-remediation-evidence.md). `docker compose
up --build` verifies backend health/readiness, the frontend HTTP surface, proxied candle fields,
JSON health/readiness events, and `RW=false` for the DuckDB bind mount. CI additionally runs a
browser check against the Compose containers to prove React renders the chart from the proxied API,
then performs a rejected backend-container write attempt and verifies the temporary source SHA-256
is unchanged.

The frontend Docker context excludes dotenv files, local dependencies, coverage, browser results,
and other local artifacts through `frontend/.dockerignore`. CI creates excluded sentinels, builds
the frontend image, and asserts those sentinels are absent from the resulting image.

## Recovery

- **Fix forward:** correct the host mount path or restore a readable source file, then run
  `docker compose up --build` and verify `/ready`.
- **Initial release limitation:** before the first image is published, no earlier application image
  exists to redeploy. Fix forward, rerun every gate, and publish a versioned image only after
  readiness succeeds.
- **Rollback after initial publication:** set `IMAGE_VERSION` and `BUILD_REVISION` to the last
  known-good published Git commit/image, recreate the Compose stack, and verify `/health` and
  `/ready`. No database migration or source mutation is needed.

## Frontend chart checks

The frontend renders one NDX `1m` chart from the same read-only `/candles` API. It requests an
older cursor window only when the operator selects **Load older candles**; TanStack Query retains
at most three bounded pages and does not materialize full history. Future timeframe aggregation
remains in DuckDB, not the browser.

Run the matching frontend gates before release:

```powershell
npm run build --prefix frontend
npm run lint --prefix frontend
npm test --prefix frontend
npm run e2e --prefix frontend
```

The browser test uses mocked bounded windows and proves the cursor request occurs only after
navigation. It does not require or modify the mounted market database.

For a running Compose stack, use the dedicated functional check instead; it does not mock the API:

```powershell
npm exec --prefix frontend playwright test -- --config frontend/playwright.compose.config.ts
```
