import json
import logging
import sys
from collections.abc import Awaitable, Callable
from datetime import datetime as DateTime
from time import perf_counter
from typing import Literal

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

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


class Candle(BaseModel):
    datetime: DateTime
    symbol: str
    OPEN: float
    high: float
    low: float
    close: float
    tickvol: int
    volume: int
    spread: int
    origen: str
    fecha_carga: DateTime


class CandleWindow(BaseModel):
    symbol: str
    timeframe: str
    candles: list[Candle]
    next_cursor: str | None
    has_more: bool


class ClientEvent(BaseModel):
    kind: Literal["api_failure", "unhandled_error", "unhandled_rejection"]
    message: str = Field(max_length=1000)
    path: str = Field(max_length=500)


def log_database_event(event: str, **fields: str) -> None:
    logger.info(json.dumps({"event": event, **fields}, sort_keys=True))


def create_app(repository: DuckDbCandleRepository | None = None) -> FastAPI:
    app = FastAPI(title="Trading Terminal API", version="0.1.0")
    candle_service = CandleWindowService(repository or DuckDbCandleRepository())

    @app.middleware("http")
    async def log_candle_request(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        started_at = perf_counter()
        response = await call_next(request)
        if request.url.path == "/candles":
            logger.info(
                json.dumps(
                    {
                        "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                        "event": "candle_request",
                        "status_code": response.status_code,
                    },
                    sort_keys=True,
                )
            )
        return response

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

    @app.post("/client-events", status_code=202, tags=["observability"])
    def client_event(event: ClientEvent) -> None:
        logger.warning(
            json.dumps(
                {
                    "event": "client_observability",
                    "kind": event.kind,
                    "message": event.message,
                    "path": event.path,
                },
                sort_keys=True,
            )
        )

    @app.get(
        "/candles",
        response_model=CandleWindow,
        responses={
            400: {
                "description": (
                    "The requested symbol or timeframe is not supported by this candle slice."
                )
            }
        },
        tags=["candles"],
    )
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
