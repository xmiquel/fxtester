# Trading Terminal PR 1 Operations

## Quick path

1. Confirm `D:\repos_2026\98-tstlocal\data\market.duckdb` exists.
2. Set reproducible release identifiers, then run Compose:

   ```powershell
   $env:IMAGE_VERSION = "pr1-<published-git-sha>"
   $env:BUILD_REVISION = "<published-git-sha>"
   docker compose up --build
   ```

3. Confirm `curl http://localhost:8000/ready` returns HTTP 200 and `{"status":"ready"}`.

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

## Monitoring expectations

- Probe `/health` for liveness and `/ready` for database-backed deployment readiness.
- Alert when readiness is non-200 or `database_unavailable` appears in backend stdout.
- Keep readiness success evidence with each deployment (the HTTP response and the backend log event).
- Investigate source readability and the immutable mount before restarting or changing configuration.

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
uvx semgrep scan --config p/python --error backend
```

Treat a dependency finding from `pip-audit` or a source finding from Ruff security rules or Semgrep
as a release blocker: identify the affected package or code path, apply the minimal safe fix, and
rerun every command above. Do not bypass a failing check with a CI exception.

## Recovery

- **Fix forward:** correct the host mount path or restore a readable source file, then run
  `docker compose up --build` and verify `/ready`.
- **Initial release limitation:** before the first image is published, no earlier application image
  exists to redeploy. Fix forward, rerun every gate, and publish a versioned image only after
  readiness succeeds.
- **Rollback after initial publication:** set `IMAGE_VERSION` and `BUILD_REVISION` to the last
  known-good published Git commit/image, recreate the Compose stack, and verify `/health` and
  `/ready`. No database migration or source mutation is needed.

PR 2 owns the chart UI, generated frontend client, and frontend-specific test gates. They are not
required for this PR 1 backend readiness gate.
