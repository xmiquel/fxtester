# Trading Terminal Foundation

This workspace contains the bounded, read-only trading terminal foundation and its single-chart UI.

## Quick path

1. Ensure `D:\repos_2026\98-tstlocal\data\market.duckdb` exists and is readable.
2. Set `IMAGE_VERSION` and `BUILD_REVISION` to the published Git commit identifier, then run
   `docker compose up --build`.
3. Verify `curl http://localhost:8000/ready` returns `{"status":"ready"}`.
4. Open `http://localhost:5173` to view the NDX `1m` candlestick chart. Use **Load older candles**
   only when you want the next bounded history window.

If Compose reports that `/data/market.duckdb` cannot be mounted, check the host path in
`docker-compose.yml`, confirm the file exists, and retry after correcting the path. A 503 from
`/health`, `/ready`, or `/candles` means the database is missing, unavailable, or not readable;
inspect the backend logs before changing the mount.

## Backend boundary

- The source is mounted at `/data/market.duckdb` as a read-only bind mount.
- The API reads `dt_ohlc_m1` and returns source column names unchanged, including `OPEN` and `close`.
- Requests are filtered, ordered, and limited in DuckDB; each response contains at most 200 candles.
- This slice exposes only `NDX` `1m` analysis data. It has no ingestion, writes, orders, auth, live feed, or timeframe selector.
- The source bind mount is immutable. Backend tests use isolated temporary DuckDB files and never
  the mounted source.

## Operations and rollback

- **Readiness:** use `/ready` for deployment checks; it verifies `dt_ohlc_m1` is available and
  emits a structured Uvicorn log event. `/health` and `/ready` emit `database_health` and
  `database_readiness` respectively for both success and database-unavailable outcomes.
- **Source safety:** never remove `read_only: true` or add a write-capable repository path.
- **Fix forward:** correct the host mount or restore the readable DuckDB file, then run
  `docker compose up --build` and verify `/ready`.
- **Rollback:** the initial publication has no earlier image to redeploy, so fix forward first.
  After publication, stop Compose and redeploy the last known-good Git commit/image identifier;
  no schema migration or source-data write is required.

## Frontend boundary

- The terminal renders one NDX `1m` candlestick chart. It has no symbol selector, timeframe
  selector, orders, authentication, or aggregation UI.
- The generated TypeScript candle contract is in `frontend/src/api/generated.ts`. Regenerate it
  after exporting `backend/openapi.json` with `npm run generate:api --prefix frontend`.
- TanStack Query caches cursor windows by symbol, timeframe, cursor, and limit. It retains at most
  three pages, so older history is requested only after **Load older candles** is selected.
- Future concurrent charts can share identical market windows, but this slice intentionally shows
  only one chart.

Run backend checks from `backend/` with `uv run pytest --cov=app`, `uv run ruff check .`, `uv run mypy app`, and `uv run pip-audit`. Run frontend checks with `npm run build --prefix frontend`, `npm run lint --prefix frontend`, `npm test --prefix frontend`, and `npm run e2e --prefix frontend`.
