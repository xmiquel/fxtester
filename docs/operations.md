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
   Then fetch `curl http://localhost:8000/symbols`. `{"symbols":[]}` is healthy: do not probe
   candles when no symbol is available. Select a returned symbol in the browser, or use it in
    `curl "http://localhost:5173/api/candles?symbol=<symbol>&timeframe=5m"`.
   Confirm HTTP 200 with `OPEN`, `high`, `low`, and `close` through the frontend proxy. Run the
   Compose browser check below to prove React executes and renders that API response. Inspect
   backend logs for
   `database_health`, `database_readiness`, and `symbol_catalog_request`, and inspect the container
   mount for `/data/market.duckdb` with `RW=false`.

## Local stack wrappers

From the repository root, use the root PowerShell wrappers to start or stop the Compose stack:

```powershell
.\Start-LocalStack.ps1
.\Start-LocalStack.ps1 -WaitTimeoutSeconds 120
.\Stop-LocalStack.ps1
```

From another working directory, invoke the wrappers by their repository path:

```powershell
& "D:\repos\fxtester\Start-LocalStack.ps1"
& "D:\repos\fxtester\Stop-LocalStack.ps1"
```

Start waits up to 90 seconds by default for every Compose-defined service to reach its configured
running or healthy state. Use a custom timeout from 1 through 600 seconds when needed. Success means
the stack reached that state and the wrapper reports its Compose status. If startup fails, follow the
[recovery guidance](#recovery). Stop preserves Docker volumes and the host DuckDB file; it removes
containers and the network only.

## Failure diagnosis

| Symptom | Check | Fix |
|---|---|---|
| Compose cannot mount `/data/market.duckdb` | The host path and file permissions | Correct the bind source, then recreate the stack |
| `/health` or `/ready` returns 503 | Backend logs and DuckDB readability | Restore the file or mount a readable copy; do not make it writable |
| `/symbols` returns 503 | `symbol_catalog_request` and database-unavailable logs | Restore the readable source, verify `/ready`, then retry catalog discovery |
| `/symbols` returns `{"symbols":[]}` | Confirm the source table has usable non-blank symbols | This is a valid empty catalog, not a database outage; do not fabricate a fallback symbol |
| `/candles` returns 400 | Request includes a valid `symbol` from `/symbols` and a supported timeframe (`1m`, `5m`, `15m`, or `1h`) | Supply a discovered symbol. Only an omitted symbol resolves to freshly discovered `NDX`; empty explicit symbols, unsupported symbols, and unsupported timeframes are rejected |
| `/candles` returns 503 | Same database availability check | Fix the source and verify readiness before retrying |

The API writes structured JSON events through Uvicorn's container logger. `/health` emits
`database_health` and `/ready` emits `database_readiness`; both use `status=ok`/`ready` on
success and `status=unavailable` with the request path and error type on a database failure.
The typed response is `type=service_unavailable`; it does not expose arbitrary database details.
The narrowly scoped `POST /client-events` endpoint records browser `api_failure`,
`unhandled_error`, and `unhandled_rejection` events as `client_observability` JSON log records.
It is self-hosted: no browser event is sent to an external service.
Every `/candles` response emits a `candle_request` JSON record, and every `/symbols` response emits
`symbol_catalog_request`; both include `status_code` and `duration_ms`, so latency is measurable
from the same backend stdout.

## Observability baseline

This existing project-wide baseline intentionally uses self-hosted structured application logs and
runtime checks only. It does not provide Prometheus, Alertmanager, a `/metrics` endpoint, alert rules,
or alert routing. This focused candle-history change does not add a production metrics system.

- Probe `/health` for liveness and `/ready` for database-backed deployment readiness. Readiness
  verifies source availability, not that the catalog contains at least one valid symbol.
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
up --build` verifies backend health/readiness, the frontend HTTP surface, valid empty-catalog
handling, an available symbol's proxied candle fields, JSON health/readiness/catalog events, and
`RW=false` for the DuckDB bind mount. CI additionally runs a
browser check against the Compose containers to prove React renders the chart from the proxied API,
then performs a rejected backend-container write attempt and verifies the temporary source SHA-256
is unchanged. CI also recreates the Compose backend against an unreadable catalog source and asserts
the typed `GET /symbols` 503 envelope before recovery.

The frontend Docker context excludes dotenv files, local dependencies, coverage, browser results,
and other local artifacts through `frontend/.dockerignore`. CI creates excluded sentinels, builds
the frontend image, and asserts those sentinels are absent from the resulting image.

## Recovery

- **Fix forward:** correct the host mount path or restore a readable source file, then run
  `docker compose up --build`, verify `/ready`, and fetch `/symbols`. Request `/candles` only when
  a symbol is available; an empty catalog requires source-content investigation, not mount recovery.
- **Initial release limitation:** before the first image is published, no earlier application image
  exists to redeploy. Fix forward, rerun every gate, and publish a versioned image only after
  readiness succeeds.
- **Rollback after initial publication:** set `IMAGE_VERSION` and `BUILD_REVISION` to the last
  known-good published Git commit/image, recreate the Compose stack, and verify `/health` and
  `/ready`. No database migration or source mutation is needed.

## Frontend chart checks

The frontend first fetches `/symbols`, selects the deterministic first symbol, and exposes the
catalog in an accessible selector. A valid empty catalog shows an accessible no-symbols state, and
catalog failure shows an accessible retryable error; neither state requests candles. Changing the
selection uses an isolated symbol/timeframe-keyed cursor cache. Once the chart is active, it requests older
cursor windows in 1000-candle pages only after a deliberate pointer drag approaches the left boundary;
prepending preserves the visible logical range. Loaded pages are retained up to 20,000 candles per
active symbol/timeframe query, and older history loading stops at that safety cap without evicting
retained candles below it. Timeframe aggregation remains in DuckDB, not the browser, for the supported
`1m`, `5m`, `15m`, and `1h` intervals.

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
