from __future__ import annotations

import re
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Protocol, cast

import duckdb
from fastapi import HTTPException

SOURCE_DATABASE = Path("/data/market.duckdb")
SUPPORTED_TIMEFRAMES: frozenset[str] = frozenset(
    {"1m", "2m", "5m", "15m", "1h", "1d", "1w", "1M"}
)
DEFAULT_TIMEFRAME: str = "1m"
# Fixed seconds are used for preset ordering and the backtest strategy frequency.
TIMEFRAME_BUCKET_SECONDS: dict[str, int] = {
    "1m": 60,
    "2m": 120,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "1d": 86400,
    "1w": 604800,
    # Calendar months have no fixed duration; this value is only a frequency hint.
    "1M": 2592000,
}
TIMEFRAME_TOKEN_PATTERN = re.compile(r"^(?P<amount>[1-9][0-9]*)(?P<unit>[mhdwM])$")
EPOCH = datetime(1970, 1, 1)
SOURCE_TABLE = "dt_ohlc_m1"
CANDLE_WINDOW_LIMIT = 1000
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


@dataclass(frozen=True)
class ParsedTimeframe:
    token: str
    amount: int
    unit: str
    bucket_seconds: int

    @property
    def is_calendar(self) -> bool:
        return self.unit in {"d", "w", "M"}


def parse_timeframe(timeframe: str) -> ParsedTimeframe | None:
    match = TIMEFRAME_TOKEN_PATTERN.fullmatch(timeframe)
    if match is None:
        return None

    amount = int(match.group("amount"))
    unit = match.group("unit")
    multipliers = {"m": 60, "h": 3600, "d": 86400, "w": 604800, "M": 2592000}
    return ParsedTimeframe(
        token=f"{amount}{unit}", amount=amount, unit=unit, bucket_seconds=amount * multipliers[unit]
    )


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
        super().__init__(
            f"Unsupported timeframe '{timeframe}'. "
            "Expected a positive integer followed by 'm', 'h', 'd', 'w', or 'M'."
        )


def normalize_cursor_to_bucket(cursor: datetime, bucket_seconds: int) -> datetime:
    """Return the inclusive bucket start used as an aggregate cursor boundary."""
    if bucket_seconds == TIMEFRAME_BUCKET_SECONDS[DEFAULT_TIMEFRAME]:
        return cursor

    if cursor.tzinfo is not None:
        cursor = cursor.astimezone(timezone.utc).replace(tzinfo=None)

    bucket = timedelta(seconds=bucket_seconds)
    return EPOCH + ((cursor - EPOCH) // bucket) * bucket


def normalize_cursor_to_timeframe(cursor: datetime, timeframe: ParsedTimeframe) -> datetime:
    """Normalize a cursor without converting raw calendar timestamps through UTC."""
    if not timeframe.is_calendar:
        return normalize_cursor_to_bucket(cursor, timeframe.bucket_seconds)

    if cursor.tzinfo is not None:
        # DuckDB stores broker timestamps as naive wall-clock values. Preserve the
        # requested wall clock instead of changing it to an absolute UTC instant.
        cursor = cursor.replace(tzinfo=None)

    if timeframe.unit == "d":
        calendar_date = cursor.date()
        days_since_epoch = (calendar_date - EPOCH.date()).days
        bucket_days = (days_since_epoch // timeframe.amount) * timeframe.amount
        return datetime.combine(EPOCH.date() + timedelta(days=bucket_days), datetime.min.time())

    if timeframe.unit == "w":
        monday = cursor.date() - timedelta(days=cursor.weekday())
        epoch_monday = datetime(1970, 1, 5).date()
        weeks_since_epoch = (monday - epoch_monday).days // 7
        bucket_weeks = (weeks_since_epoch // timeframe.amount) * timeframe.amount
        return datetime.combine(epoch_monday + timedelta(weeks=bucket_weeks), datetime.min.time())

    month_index = (cursor.year - 1970) * 12 + cursor.month - 1
    bucket_index = (month_index // timeframe.amount) * timeframe.amount
    year, month_offset = divmod(bucket_index, 12)
    return datetime(year + 1970, month_offset + 1, 1)


class CandleRepository(Protocol):
    def check_available(self) -> None: ...

    def list_symbols(self) -> list[str]: ...

    def list_timeframes(self) -> list[str]: ...

    def read_window(
        self, symbol: str, timeframe: str, cursor: datetime | None, limit: int
    ) -> CandleWindow: ...

    def read_bounds(self, symbol: str, timeframe: str) -> tuple[datetime, datetime] | None: ...


class DuckDbCandleRepository:
    def __init__(self, database_path: Path = SOURCE_DATABASE) -> None:
        self.database_path = database_path

    def read_window(
        self, symbol: str, timeframe: str, cursor: datetime | None, limit: int
    ) -> CandleWindow:
        parsed_timeframe = parse_timeframe(timeframe)
        if parsed_timeframe is None:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        rows, columns = self._read_rows(
            symbol, parsed_timeframe, limit + 1, cursor=cursor, descending=True
        )
        has_more = len(rows) > limit
        rows = rows[:limit]
        candles = self._map_rows(columns, reversed(rows))
        next_cursor = (
            cast(datetime, candles[0]["datetime"]).isoformat()
            if has_more and candles
            else None
        )
        return CandleWindow(candles=candles, next_cursor=next_cursor, has_more=has_more)

    def read_series(
        self, symbol: str, timeframe: str, start_datetime: datetime, end_datetime: datetime
    ) -> list[dict[str, object]]:
        parsed_timeframe = parse_timeframe(timeframe)
        if parsed_timeframe is None:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        try:
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                if parsed_timeframe.token == DEFAULT_TIMEFRAME:
                    query = f"""
                        SELECT {SOURCE_COLUMN_SQL}
                        FROM {SOURCE_TABLE}
                        WHERE symbol = ? AND datetime >= ? AND datetime <= ?
                        ORDER BY datetime ASC
                    """  # noqa: S608 - identifier is a module constant
                else:
                    bucket_expression = self._bucket_expression(parsed_timeframe)
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
                        WHERE symbol = ?
                        GROUP BY {bucket_expression}, symbol
                        HAVING {bucket_expression} >= ? AND {bucket_expression} <= ?
                        ORDER BY {bucket_expression} ASC
                    """  # noqa: S608 - identifier is a module constant
                parameters = [symbol, start_datetime, end_datetime]
                rows = connection.execute(query, parameters).fetchall()
                columns = [column[0] for column in connection.description]
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error
        return self._map_rows(columns, rows)

    def read_bounds(self, symbol: str, timeframe: str) -> tuple[datetime, datetime] | None:
        parsed_timeframe = parse_timeframe(timeframe)
        if parsed_timeframe is None:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        try:
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                if parsed_timeframe.token == DEFAULT_TIMEFRAME:
                    query = f"""
                        SELECT MIN(datetime), MAX(datetime)
                        FROM {SOURCE_TABLE}
                        WHERE symbol = ?
                    """  # noqa: S608 - identifier is a module constant
                else:
                    bucket_expression = self._bucket_expression(parsed_timeframe)
                    query = f"""
                        SELECT MIN({bucket_expression}), MAX({bucket_expression})
                        FROM {SOURCE_TABLE}
                        WHERE symbol = ?
                    """  # noqa: S608 - identifier is a module constant
                row = connection.execute(query, [symbol]).fetchone()
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error

        if row is None:
            return None
        start_datetime, end_datetime = row
        if start_datetime is None or end_datetime is None:
            return None
        return cast(datetime, start_datetime), cast(datetime, end_datetime)

    @staticmethod
    def _bucket_expression(timeframe: ParsedTimeframe) -> str:
        if timeframe.unit == "d":
            return f"""TIMESTAMP '1970-01-01' + (
                    DATE_DIFF('day', DATE '1970-01-01', DATE_TRUNC('day', datetime))
                    // {timeframe.amount} * {timeframe.amount}
                  ) * INTERVAL '1 day'"""
        if timeframe.unit == "w":
            return f"""TIMESTAMP '1970-01-05' + (
                    DATE_DIFF('week', DATE '1970-01-05', DATE_TRUNC('week', datetime))
                    // {timeframe.amount} * {timeframe.amount}
                  ) * INTERVAL '1 week'"""
        if timeframe.unit == "M":
            return f"""TIMESTAMP '1970-01-01' + (
                    DATE_DIFF('month', DATE '1970-01-01', DATE_TRUNC('month', datetime))
                    // {timeframe.amount} * {timeframe.amount}
                  ) * INTERVAL '1 month'"""
        return f"""TIMESTAMP 'epoch' + (
                CAST(FLOOR(EXTRACT(epoch FROM datetime)) AS BIGINT)
                // {timeframe.bucket_seconds} * {timeframe.bucket_seconds}
              ) * INTERVAL '1 second'"""

    def _read_rows(
        self,
        symbol: str,
        timeframe: ParsedTimeframe,
        limit: int,
        *,
        cursor: datetime | None,
        descending: bool,
    ) -> tuple[list[tuple[object, ...]], list[str]]:
        order = "DESC" if descending else "ASC"
        try:
            # The connection is read-only and the limit is applied by DuckDB.
            with duckdb.connect(str(self.database_path), read_only=True) as connection:
                parameters: list[object] = [symbol]
                where_clause = "WHERE symbol = ?"
                if cursor is not None:
                    where_clause += " AND datetime < ?"
                    parameters.append(cursor)

                if timeframe.token == DEFAULT_TIMEFRAME:
                    query = f"""
                        SELECT {SOURCE_COLUMN_SQL}
                        FROM {SOURCE_TABLE}
                        {where_clause}
                        ORDER BY datetime {order}
                        LIMIT ?
                    """  # noqa: S608 - identifiers and order are constants
                else:
                    bucket_expression = self._bucket_expression(timeframe)
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
                        ORDER BY {bucket_expression} {order}
                        LIMIT ?
                    """  # noqa: S608 - identifiers and order are constants
                parameters.append(limit)
                rows = connection.execute(query, parameters).fetchall()
                columns = [column[0] for column in connection.description]
        except (duckdb.Error, OSError) as error:
            raise DatabaseUnavailable("market database is unavailable") from error
        return rows, columns

    @staticmethod
    def _map_rows(
        columns: list[str], rows: Iterable[tuple[object, ...]]
    ) -> list[dict[str, object]]:
        source_rows = [dict(zip(columns, row, strict=True)) for row in rows]
        return [
            {
                contract_field: source_row[source_field]
                for source_field, contract_field in SOURCE_TO_CONTRACT_FIELDS
            }
            for source_row in source_rows
        ]

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
        parsed_timeframe = parse_timeframe(timeframe)
        if parsed_timeframe is None:
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
            parsed_cursor = normalize_cursor_to_timeframe(parsed_cursor, parsed_timeframe)
        catalog = self.repository.list_symbols()
        effective_symbol = OMITTED_SYMBOL_COMPATIBILITY_DEFAULT if symbol is None else symbol
        if effective_symbol not in catalog:
            raise UnsupportedSymbolError(effective_symbol)
        window = self.repository.read_window(
            effective_symbol, parsed_timeframe.token, parsed_cursor, limit
        )
        return {
            "symbol": effective_symbol,
            "timeframe": parsed_timeframe.token,
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
