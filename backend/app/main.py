import json
import logging
import sys

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.features.candles.window import (
    CANDLE_WINDOW_LIMIT,
    SUPPORTED_SYMBOL,
    SUPPORTED_TIMEFRAME,
    CandleWindowService,
    DatabaseUnavailable,
    DuckDbCandleRepository,
)

# Application loggers do not inherit a handler from Uvicorn's default configuration.
# Keep this handler local so database events reach container stdout in every Uvicorn runtime.
logger = logging.getLogger("app.database")
logger.setLevel(logging.INFO)
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)


def log_database_event(event: str, **fields: str) -> None:
    logger.info(json.dumps({"event": event, **fields}, sort_keys=True))


def create_app(repository: DuckDbCandleRepository | None = None) -> FastAPI:
    app = FastAPI(title="Trading Terminal API", version="0.1.0")
    candle_service = CandleWindowService(repository or DuckDbCandleRepository())

    @app.exception_handler(DatabaseUnavailable)
    async def database_unavailable(
        request: Request, error: DatabaseUnavailable
    ) -> JSONResponse:
        event = {
            "/health": "database_health",
            "/ready": "database_readiness",
        }.get(request.url.path, "database_unavailable")
        logger.error(
            json.dumps(
                {
                    "event": event,
                    "error_type": type(error).__name__,
                    "path": request.url.path,
                    "status": "unavailable",
                },
                sort_keys=True,
            ),
            exc_info=(type(error), error, error.__traceback__),
        )
        return JSONResponse(
            status_code=503,
            content={
                "type": "service_unavailable",
                "title": "Market data service unavailable",
                "detail": str(error),
            },
        )

    @app.get("/health", tags=["system"])
    def health() -> dict[str, str]:
        candle_service.check_database()
        log_database_event("database_health", status="ok")
        return {"status": "ok"}

    @app.get("/ready", tags=["system"])
    def ready() -> dict[str, str]:
        candle_service.check_database()
        log_database_event("database_readiness", status="ready")
        return {"status": "ready"}

    @app.get("/candles", tags=["candles"])
    def candles(
        symbol: str = SUPPORTED_SYMBOL,
        timeframe: str = SUPPORTED_TIMEFRAME,
        cursor: str | None = None,
        limit: int = CANDLE_WINDOW_LIMIT,
    ) -> dict[str, object]:
        return candle_service.get_window(
            symbol=symbol, timeframe=timeframe, cursor=cursor, limit=limit
        )

    return app


app = create_app()
