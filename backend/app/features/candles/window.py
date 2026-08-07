from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol

import duckdb
from fastapi import HTTPException

SOURCE_DATABASE = Path("/data/market.duckdb")
SUPPORTED_TIMEFRAMES: frozenset[str] = frozenset({"1m", "5m", "15m", "1h"})
DEFAULT_TIMEFRAME: str = "1m"
# Epoch seconds for each timeframe — used for floor-division binning via
#   TIMESTAMP 'epoch' + (epoch_seconds // bucket_seconds * bucket_seconds) * INTERVAL '1 second'
TIMEFRAME_BUCKET_SECONDS: dict[str, int] = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
}
EPOCH = datetime(1970, 1, 1)
SOURCE_TABLE = "dt_ohlc_m1"
CANDLE_WINDOW_LIMIT = 200
OMITTED_SYMBOL_COMPATIBILITY_DEFAULT = "NDX"
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
# DuckDB normalizes unquoted result names. Select the source's quoted OPEN column
# with its normalized result name, then map it deliberately to the public contract.
SOURCE_COLUMN_SQL = ", ".join(
    (
        "datetime",
        "symbol",
        '"OPEN" AS open',
        "high",
        "low",
        '"close" AS close',
        "tickvol",
        "volume",
        "spread",
        "origen",
        "fecha_carga",
    )
)
SOURCE_TO_CONTRACT_FIELDS = (
    ("datetime", "datetime"),
    ("symbol", "symbol"),
    ("open", "OPEN"),
    ("high", "high"),
    ("low", "low"),
    ("close", "close"),
    ("tickvol", "tickvol"),
    ("volume", "volume"),
    ("spread", "spread"),
    ("origen", "origen"),
    ("fecha_carga", "fecha_carga"),
)
DATABASE_AVAILABILITY_QUERY = f"SELECT 1 FROM {SOURCE_TABLE} LIMIT 1"  # noqa: S608
SYMBOL_CATALOG_QUERY = f"""
    SELECT DISTINCT symbol
    FROM {SOURCE_TABLE}
    WHERE symbol IS NOT NULL AND TRIM(symbol) <> ''
    ORDER BY symbol
"""  # noqa: S608 - identifier is a module constant


@dataclass(frozen=True)
class CandleWindow:
    candles: list[dict[str, object]]
    next_cursor: str | None
    has_more: bool


class DatabaseUnavailable(RuntimeError):
    """Raised when the configured source cannot be opened or queried."""


class UnsupportedSymbolError(ValueError):
    """Raised when a candle request does not name a current catalog symbol."""

    def __init__(self, symbol: str) -> None:
        self.symbol = symbol
        message = f"Symbol '{symbol}' is not present in the discovered catalog."
        super().__init__(message)


class UnsupportedTimeframeError(ValueError):
    """Raised when a candle request uses a timeframe outside this slice."""

    def __init__(self, timeframe: str) -> None:
        self.timeframe = timeframe
        supported = sorted(SUPPORTED_TIMEFRAMES, key=lambda tf: TIMEFRAME_BUCKET_SECONDS[tf])
        super().__init__(f"Unsupported timeframe '{timeframe}'. Supported: {supported}")


def normalize_cursor_to_bucket(cursor: datetime, timeframe: str) -> datetime:
    """Return the inclusive bucket start used as an aggregate cursor boundary."""
    if timeframe == "1m":
        return cursor

    if cursor.tzinfo is not None:
        cursor = cursor.astimezone(timezone.utc).replace(tzinfo=None)

    bucket = timedelta(seconds=TIMEFRAME_BUCKET_SECONDS[timeframe])
    return EPOCH + ((cursor - EPOCH) // bucket) * bucket


class CandleRepository(Protocol):
    def check_available(self) -> None: ...

    def list_symbols(self) -> list[str]: ...

    def list_timeframes(self) -> list[str]: ...

    def read_window(
        self, symbol: str, timeframe: str, cursor: datetime | None, limit: int
    ) -> CandleWindow: ...


class DuckDbCandleRepository:
    def __init__(self, database_path: Path = SOURCE_DATABASE) -> None:
        self.database_path = database_path

    def read_window(
        self, symbol: str, timeframe: str, cursor: datetime | None, limit: int
    ) -> CandleWindow:
        try:
            # The connection is read-only and the limit is applied by DuckDB.
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                if timeframe == "1m":
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
                else:
                    bucket_seconds = TIMEFRAME_BUCKET_SECONDS[timeframe]
                    bucket_expression = f"""TIMESTAMP 'epoch' + (
                            CAST(FLOOR(EXTRACT(epoch FROM datetime)) AS BIGINT)
                            // {bucket_seconds} * {bucket_seconds}
                          ) * INTERVAL '1 second'"""
                    parameters = [symbol]
                    where_clause = "WHERE symbol = ?"
                    if cursor is not None:
                        where_clause = "WHERE symbol = ? AND datetime < ?"
                        parameters.append(cursor)
                    query = f"""
                        SELECT
                          {bucket_expression} AS datetime,
                          symbol,
                          FIRST("OPEN" ORDER BY datetime) AS open,
                          MAX(high) AS high, MIN(low) AS low,
                          LAST("close" ORDER BY datetime) AS close,
                          SUM(tickvol) AS tickvol, SUM(volume) AS volume,
                          LAST(spread ORDER BY datetime) AS spread,
                          LAST(origen ORDER BY datetime) AS origen,
                          MAX(fecha_carga) AS fecha_carga
                        FROM {SOURCE_TABLE}
                        {where_clause}
                        GROUP BY {bucket_expression}, symbol
                        ORDER BY {bucket_expression} DESC
                        LIMIT ?
                    """  # noqa: S608 - identifiers are module constants
                parameters.append(limit + 1)
                rows = connection.execute(query, parameters).fetchall()
                columns = [column[0] for column in connection.description]
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error

        has_more = len(rows) > limit
        rows = rows[:limit]
        source_rows = [dict(zip(columns, row, strict=True)) for row in reversed(rows)]
        candles = [
            {
                contract_field: source_row[source_field]
                for source_field, contract_field in SOURCE_TO_CONTRACT_FIELDS
            }
            for source_row in source_rows
        ]
        next_cursor = candles[0]["datetime"].isoformat() if has_more and candles else None
        return CandleWindow(candles=candles, next_cursor=next_cursor, has_more=has_more)

    def list_symbols(self) -> list[str]:
        try:
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                rows = connection.execute(SYMBOL_CATALOG_QUERY).fetchall()
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error
        return [symbol for (symbol,) in rows]

    def list_timeframes(self) -> list[str]:
        return sorted(SUPPORTED_TIMEFRAMES, key=lambda tf: TIMEFRAME_BUCKET_SECONDS[tf])

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
        self, symbol: str | None, timeframe: str, cursor: str | None, limit: int
    ) -> dict[str, object]:
        if timeframe not in SUPPORTED_TIMEFRAMES:
            raise UnsupportedTimeframeError(timeframe)
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
            parsed_cursor = normalize_cursor_to_bucket(parsed_cursor, timeframe)
        catalog = self.repository.list_symbols()
        effective_symbol = OMITTED_SYMBOL_COMPATIBILITY_DEFAULT if symbol is None else symbol
        if effective_symbol not in catalog:
            raise UnsupportedSymbolError(effective_symbol)
        window = self.repository.read_window(effective_symbol, timeframe, parsed_cursor, limit)
        return {
            "symbol": effective_symbol,
            "timeframe": timeframe,
            "candles": window.candles,
            "next_cursor": window.next_cursor,
            "has_more": window.has_more,
        }

    def list_symbols(self) -> list[str]:
        return self.repository.list_symbols()

    def list_timeframes(self) -> list[str]:
        return self.repository.list_timeframes()

    def check_database(self) -> None:
        self.repository.check_available()
