from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

import duckdb
from fastapi import HTTPException

SOURCE_DATABASE = Path("/data/market.duckdb")
SUPPORTED_SYMBOL = "NDX"
SUPPORTED_TIMEFRAME = "1m"
SOURCE_TABLE = "dt_ohlc_m1"
CANDLE_WINDOW_LIMIT = 200
SOURCE_COLUMNS = (
    "datetime",
    "symbol",
    '"OPEN"',
    "high",
    "low",
    '"close"',
    "tickvol",
    "volume",
    "spread",
    "origen",
    "fecha_carga",
)
SOURCE_COLUMN_SQL = ", ".join(SOURCE_COLUMNS)
DATABASE_AVAILABILITY_QUERY = f"SELECT 1 FROM {SOURCE_TABLE} LIMIT 1"  # noqa: S608


@dataclass(frozen=True)
class CandleWindow:
    candles: list[dict[str, object]]
    next_cursor: str | None
    has_more: bool


class DatabaseUnavailable(RuntimeError):
    """Raised when the configured source cannot be opened or queried."""


class CandleRepository(Protocol):
    def check_available(self) -> None: ...

    def read_window(
        self, symbol: str, cursor: datetime | None, limit: int
    ) -> CandleWindow: ...


class DuckDbCandleRepository:
    def __init__(self, database_path: Path = SOURCE_DATABASE) -> None:
        self.database_path = database_path

    def read_window(
        self, symbol: str, cursor: datetime | None, limit: int
    ) -> CandleWindow:
        try:
            # The connection is read-only and the limit is applied by DuckDB.
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                parameters: list[object] = [symbol]
                if cursor is None:
                    query = f"""
                        SELECT {SOURCE_COLUMN_SQL}
                        FROM {SOURCE_TABLE}
                        WHERE symbol = ?
                        ORDER BY datetime DESC
                        LIMIT ?
                    """  # noqa: S608 - identifiers are module constants
                else:
                    query = f"""
                        SELECT {SOURCE_COLUMN_SQL}
                        FROM {SOURCE_TABLE}
                        WHERE symbol = ? AND datetime < ?
                        ORDER BY datetime DESC
                        LIMIT ?
                    """  # noqa: S608 - identifiers are module constants
                    parameters.append(cursor)
                parameters.append(limit + 1)
                rows = connection.execute(query, parameters).fetchall()
                columns = [column[0] for column in connection.description]
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error

        has_more = len(rows) > limit
        rows = rows[:limit]
        candles = [dict(zip(columns, row, strict=True)) for row in reversed(rows)]
        next_cursor = candles[0]["datetime"].isoformat() if has_more and candles else None
        return CandleWindow(candles=candles, next_cursor=next_cursor, has_more=has_more)

    def check_available(self) -> None:
        try:
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                connection.execute(DATABASE_AVAILABILITY_QUERY)
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error


class CandleWindowService:
    def __init__(self, repository: CandleRepository) -> None:
        self.repository = repository

    def get_window(
        self, symbol: str, timeframe: str, cursor: str | None, limit: int
    ) -> dict[str, object]:
        if symbol != SUPPORTED_SYMBOL:
            raise HTTPException(
                status_code=400,
                detail=f"Only symbol '{SUPPORTED_SYMBOL}' is supported",
            )
        if timeframe != SUPPORTED_TIMEFRAME:
            raise HTTPException(
                status_code=400,
                detail=f"Only timeframe '{SUPPORTED_TIMEFRAME}' is supported",
            )
        if limit < 1 or limit > CANDLE_WINDOW_LIMIT:
            raise HTTPException(
                status_code=422,
                detail=f"limit must be between 1 and {CANDLE_WINDOW_LIMIT}",
            )
        parsed_cursor: datetime | None = None
        if cursor is not None:
            try:
                parsed_cursor = datetime.fromisoformat(cursor)
            except ValueError as error:
                raise HTTPException(status_code=422, detail="cursor must be ISO-8601") from error
        window = self.repository.read_window(symbol, parsed_cursor, limit)
        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "candles": window.candles,
            "next_cursor": window.next_cursor,
            "has_more": window.has_more,
        }

    def check_database(self) -> None:
        self.repository.check_available()
