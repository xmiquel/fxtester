from datetime import datetime, timedelta
from pathlib import Path
from typing import TypedDict

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.features.candles.window import (
    SOURCE_COLUMNS,
    CandleWindowService,
    DatabaseUnavailable,
    DuckDbCandleRepository,
    normalize_cursor_to_bucket,
)
from app.main import create_app


class AggregatedCandle(TypedDict):
    datetime: str
    OPEN: float
    high: float
    low: float
    close: float
    tickvol: int
    volume: int
    spread: int
    origen: str
    fecha_carga: str


def make_database(path: str, count: int = 205) -> None:
    connection = duckdb.connect(path)
    connection.execute(
        '''CREATE TABLE dt_ohlc_m1 (
            datetime TIMESTAMP, symbol VARCHAR, "OPEN" DOUBLE, high DOUBLE,
            low DOUBLE, "close" DOUBLE, tickvol BIGINT, volume BIGINT,
            spread BIGINT, origen VARCHAR, fecha_carga TIMESTAMP
        )'''
    )
    start = datetime(2025, 1, 1)
    rows = [
        (
            start + timedelta(minutes=index),
            "NDX", 1.0, 2.0, 0.5, 1.5, index, index, 1, "test", start
        )
        for index in range(count)
    ]
    if rows:
        connection.executemany(
            "INSERT INTO dt_ohlc_m1 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
        )
    connection.close()


def insert_symbols(path: str, symbols: list[str | None]) -> None:
    connection = duckdb.connect(path)
    start = datetime(2025, 1, 2)
    rows = [
        (start, symbol, 1.0, 2.0, 0.5, 1.5, 0, 0, 1, "test", start)
        for symbol in symbols
    ]
    connection.executemany(
        "INSERT INTO dt_ohlc_m1 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows
    )
    connection.close()


def make_aggregation_database(
    path: str,
) -> list[tuple[datetime, float, float, float, float, int, int]]:
    connection = duckdb.connect(path)
    connection.execute(
        '''CREATE TABLE dt_ohlc_m1 (
            datetime TIMESTAMP, symbol VARCHAR, "OPEN" DOUBLE, high DOUBLE,
            low DOUBLE, "close" DOUBLE, tickvol BIGINT, volume BIGINT,
            spread BIGINT, origen VARCHAR, fecha_carga TIMESTAMP
        )'''
    )
    start = datetime(2025, 1, 1, 0, 0)
    source = [
        (
            start + timedelta(minutes=index),
            float(1000 + index),
            float(2000 + (index % 7) * 100 + index),
            float(500 - (index % 5) * 100 - index),
            float(3000 + index),
            index + 1,
            (index + 1) * 10,
        )
        for index in range(190)
    ]
    connection.executemany(
        "INSERT INTO dt_ohlc_m1 VALUES (?, 'NDX', ?, ?, ?, ?, ?, ?, 1, 'test', ?)",
        [(*row, row[0]) for row in source],
    )
    connection.close()
    return source


def expected_aggregated_candles(
    source: list[tuple[datetime, float, float, float, float, int, int]], bucket_minutes: int
) -> list[AggregatedCandle]:
    buckets: dict[datetime, list[tuple[datetime, float, float, float, float, int, int]]] = {}
    for row in source:
        datetime_value = row[0]
        bucket = datetime_value.replace(
            minute=datetime_value.minute // bucket_minutes * bucket_minutes
        )
        buckets.setdefault(bucket, []).append(row)

    return [
        {
            "datetime": bucket.isoformat(),
            "OPEN": rows[0][1],
            "high": max(row[2] for row in rows),
            "low": min(row[3] for row in rows),
            "close": rows[-1][4],
            "tickvol": sum(row[5] for row in rows),
            "volume": sum(row[6] for row in rows),
            "spread": 1,
            "origen": "test",
            "fecha_carga": rows[-1][0].isoformat(),
        }
        for bucket, rows in sorted(buckets.items())
    ]


def assert_aggregated_candle_matches(
    actual: dict[str, object], expected: AggregatedCandle
) -> None:
    assert actual["datetime"] == expected["datetime"]
    assert actual["OPEN"] == expected["OPEN"]
    assert actual["high"] == expected["high"]
    assert actual["low"] == expected["low"]
    assert actual["close"] == expected["close"]
    assert actual["tickvol"] == expected["tickvol"]
    assert actual["volume"] == expected["volume"]
    assert actual["spread"] == expected["spread"]
    assert actual["origen"] == expected["origen"]
    assert actual["fecha_carga"] == expected["fecha_carga"]


def test_candles_are_bounded_and_preserve_source_columns(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "limit": 500})

    assert response.status_code == 422
    response = client.get("/candles", params={"symbol": "NDX"})
    body = response.json()
    assert len(body["candles"]) == 200
    assert set(body["candles"][0]) == {column.strip('"') for column in SOURCE_COLUMNS}
    assert body["candles"][0]["symbol"] == "NDX"
    assert body["timeframe"] == "1m"
    assert body["has_more"] is True


def test_candles_map_duckdb_open_to_the_public_open_contract(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX"})

    assert response.status_code == 200
    assert response.json()["candles"][0]["OPEN"] == 1.0


def test_unsupported_symbol_is_rejected(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "SPX"})

    assert response.status_code == 400
    assert response.json() == {
        "type": "unsupported_symbol",
        "title": "Unsupported market symbol",
        "detail": "Symbol 'SPX' is not present in the discovered catalog.",
        "symbol": "SPX",
    }


def test_candle_symbol_validation_uses_a_fresh_catalog_for_each_request(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    first_response = client.get("/candles", params={"symbol": "NDX"})

    connection = duckdb.connect(str(database))
    connection.execute("DELETE FROM dt_ohlc_m1 WHERE symbol = 'NDX'")
    connection.close()
    insert_symbols(str(database), ["SPX"])

    former_symbol_response = client.get("/candles", params={"symbol": "NDX"})
    new_symbol_response = client.get("/candles", params={"symbol": "SPX"})

    assert first_response.status_code == 200
    assert former_symbol_response.status_code == 400
    assert former_symbol_response.json()["symbol"] == "NDX"
    assert new_symbol_response.status_code == 200
    assert new_symbol_response.json()["symbol"] == "SPX"


def test_omitted_symbol_uses_ndx_when_fresh_catalog_contains_ndx(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles")

    assert response.status_code == 200
    assert response.json()["symbol"] == "NDX"


def test_omitted_symbol_without_ndx_returns_typed_unsupported_symbol(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=0)
    insert_symbols(str(database), ["SPX"])
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles")

    assert response.status_code == 400
    assert response.json() == {
        "type": "unsupported_symbol",
        "title": "Unsupported market symbol",
        "detail": "Symbol 'NDX' is not present in the discovered catalog.",
        "symbol": "NDX",
    }


def test_omitted_symbol_with_unavailable_catalog_returns_typed_service_unavailable(
    tmp_path: Path,
) -> None:
    client = TestClient(create_app(DuckDbCandleRepository(tmp_path / "missing.duckdb")))

    response = client.get("/candles")

    assert response.status_code == 503
    assert response.json() == {
        "type": "service_unavailable",
        "title": "Market data service unavailable",
        "detail": "market database is unavailable",
    }


def test_discovered_non_ndx_symbol_returns_only_its_own_candles(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    insert_symbols(str(database), ["SPX"])
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    catalog = client.get("/symbols")
    response = client.get("/candles", params={"symbol": "SPX"})

    assert catalog.json()["symbols"] == ["NDX", "SPX"]
    assert response.status_code == 200
    assert response.json()["symbol"] == "SPX"
    assert [candle["symbol"] for candle in response.json()["candles"]] == ["SPX"]


def test_openapi_documents_invalid_candle_parameters(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/openapi.json")

    assert response.status_code == 200
    operation = response.json()["paths"]["/candles"]["get"]
    symbol_parameter = next(
        parameter for parameter in operation["parameters"] if parameter["name"] == "symbol"
    )
    assert symbol_parameter["required"] is False
    responses = operation["responses"]
    assert responses["400"]["content"]["application/json"]["schema"]["anyOf"] == [
        {"$ref": "#/components/schemas/UnsupportedSymbol"},
        {"$ref": "#/components/schemas/UnsupportedTimeframe"},
    ]
    assert responses["503"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/ServiceUnavailable"
    )


def test_only_one_minute_timeframe_is_exposed(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "timeframe": "2m"})

    assert response.status_code == 400
    assert response.json() == {
        "type": "unsupported_timeframe",
        "title": "Unsupported candle timeframe",
        "detail": "Unsupported timeframe '2m'. Supported: ['1m', '5m', '15m', '1h']",
        "timeframe": "2m",
    }


@pytest.mark.parametrize("timeframe", ["1m", "5m", "15m", "1h"])
def test_supported_timeframes_return_200(tmp_path: Path, timeframe: str) -> None:
    database = tmp_path / "market.duckdb"
    # Insert enough 1m rows (at least 60 for 1h aggregation)
    make_database(str(database), count=65)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "timeframe": timeframe})

    assert response.status_code == 200
    body = response.json()
    assert body["timeframe"] == timeframe
    assert body["symbol"] == "NDX"
    assert len(body["candles"]) > 0
    for candle in body["candles"]:
        assert candle["OPEN"] == 1.0
        assert candle["high"] == 2.0
        assert candle["low"] == 0.5
        assert candle["close"] == 1.5
        assert candle["symbol"] == "NDX"


@pytest.mark.parametrize(
    ("timeframe", "bucket_minutes"),
    [("5m", 5), ("15m", 15), ("1h", 60)],
)
def test_non_one_minute_timeframes_aggregate_epoch_floor_buckets(
    tmp_path: Path, timeframe: str, bucket_minutes: int
) -> None:
    database = tmp_path / "market.duckdb"
    source = make_aggregation_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "timeframe": timeframe})

    assert response.status_code == 200
    candles = response.json()["candles"]
    expected = expected_aggregated_candles(source, bucket_minutes)
    assert len(candles) == len(expected)
    assert len(candles) < len(source)
    assert [candle["datetime"] for candle in candles] == [candle["datetime"] for candle in expected]
    for actual, expected_candle in zip(candles, expected, strict=True):
        assert actual["datetime"].endswith(":00")
        assert datetime.fromisoformat(actual["datetime"]).minute % bucket_minutes == 0
        assert_aggregated_candle_matches(actual, expected_candle)


def test_fractional_timestamp_before_boundary_stays_in_prior_bucket(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=6)
    connection = duckdb.connect(str(database))
    fractional_timestamp = datetime(2025, 1, 1, 0, 4, 59, 900000)
    connection.execute(
        """INSERT INTO dt_ohlc_m1 VALUES (?, 'NDX', 10.0, 40.0, -1.0, 35.0,
        9, 90, 4, 'fractional', ?)""",
        [fractional_timestamp, fractional_timestamp],
    )
    connection.close()
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "timeframe": "5m"})

    assert response.status_code == 200
    body = response.json()
    assert body["symbol"] == "NDX"
    assert body["timeframe"] == "5m"
    assert body["has_more"] is False
    assert body["next_cursor"] is None
    assert body["candles"][0] == {
        "datetime": "2025-01-01T00:00:00",
        "symbol": "NDX",
        "OPEN": 1.0,
        "high": 40.0,
        "low": -1.0,
        "close": 35.0,
        "tickvol": 19,
        "volume": 100,
        "spread": 4,
        "origen": "fractional",
        "fecha_carga": "2025-01-01T00:04:59.900000",
    }
    assert body["candles"][1]["datetime"] == "2025-01-01T00:05:00"


@pytest.mark.parametrize(
    ("timeframe", "bucket_minutes"),
    [("5m", 5), ("15m", 15), ("1h", 60)],
)
def test_non_one_minute_timeframe_cursor_pages_are_adjacent_and_complete(
    tmp_path: Path, timeframe: str, bucket_minutes: int
) -> None:
    database = tmp_path / "market.duckdb"
    source = make_aggregation_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))
    expected_datetimes = [
        candle["datetime"] for candle in expected_aggregated_candles(source, bucket_minutes)
    ]
    cursor: str | None = None
    paged_datetimes: list[str] = []

    while True:
        parameters: dict[str, str | int] = {"symbol": "NDX", "timeframe": timeframe, "limit": 2}
        if cursor is not None:
            parameters["cursor"] = cursor
        response = client.get("/candles", params=parameters)
        assert response.status_code == 200
        page = response.json()
        page_datetimes = [candle["datetime"] for candle in page["candles"]]
        assert page_datetimes == sorted(page_datetimes)
        assert set(paged_datetimes).isdisjoint(page_datetimes)
        paged_datetimes.extend(page_datetimes)
        if not page["has_more"]:
            assert page["next_cursor"] is None
            break
        cursor = page["next_cursor"]
        assert cursor == page_datetimes[0]

    assert sorted(paged_datetimes) == expected_datetimes


@pytest.mark.parametrize(
    ("timeframe", "bucket_minutes"),
    [("5m", 5), ("15m", 15), ("1h", 60)],
)
def test_non_one_minute_intra_bucket_cursor_returns_complete_prior_buckets(
    tmp_path: Path, timeframe: str, bucket_minutes: int
) -> None:
    database = tmp_path / "market.duckdb"
    source = make_aggregation_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))
    bucket_start = datetime(2025, 1, 1, 3, 0)
    expected = [
        candle
        for candle in expected_aggregated_candles(source, bucket_minutes)
        if candle["datetime"] < bucket_start.isoformat()
    ]
    cursor = (bucket_start + timedelta(minutes=2)).isoformat()
    paged_candles: list[dict[str, object]] = []

    while True:
        response = client.get(
            "/candles",
            params={"symbol": "NDX", "timeframe": timeframe, "cursor": cursor, "limit": 2},
        )

        assert response.status_code == 200
        page = response.json()
        candles = page["candles"]
        assert all(
            datetime.fromisoformat(candle["datetime"]).minute % bucket_minutes == 0
            for candle in candles
        )
        assert all(candle["datetime"] < bucket_start.isoformat() for candle in candles)
        paged_candles.extend(candles)
        if not page["has_more"]:
            assert page["next_cursor"] is None
            break
        cursor = page["next_cursor"]

    candles_by_datetime = sorted(paged_candles, key=lambda candle: str(candle["datetime"]))
    assert [candle["datetime"] for candle in candles_by_datetime] == [
        candle["datetime"] for candle in expected
    ]
    for actual, expected_candle in zip(candles_by_datetime, expected, strict=True):
        assert_aggregated_candle_matches(actual, expected_candle)


@pytest.mark.parametrize(
    ("timeframe", "cursor", "expected_bucket_start"),
    [
        ("5m", "2025-01-01T03:02:00+01:00", datetime(2025, 1, 1, 2, 0)),
        ("15m", "2025-01-01T04:17:00+02:00", datetime(2025, 1, 1, 2, 15)),
        ("1h", "2024-12-31T23:43:00-03:00", datetime(2025, 1, 1, 2, 0)),
    ],
)
def test_offset_cursor_is_normalized_to_utc_bucket_start(
    timeframe: str, cursor: str, expected_bucket_start: datetime
) -> None:
    actual_bucket_start = normalize_cursor_to_bucket(datetime.fromisoformat(cursor), timeframe)

    assert actual_bucket_start == expected_bucket_start


@pytest.mark.parametrize(
    ("timeframe", "bucket_minutes", "cursor", "expected_bucket_start"),
    [
        ("5m", 5, "2025-01-01T03:02:00+01:00", datetime(2025, 1, 1, 2, 0)),
        ("15m", 15, "2025-01-01T04:17:00+02:00", datetime(2025, 1, 1, 2, 15)),
        ("1h", 60, "2024-12-31T23:43:00-03:00", datetime(2025, 1, 1, 2, 0)),
    ],
)
def test_offset_intra_bucket_cursor_returns_complete_non_overlapping_pages(
    tmp_path: Path,
    timeframe: str,
    bucket_minutes: int,
    cursor: str,
    expected_bucket_start: datetime,
) -> None:
    database = tmp_path / "market.duckdb"
    source = make_aggregation_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))
    expected = [
        candle
        for candle in expected_aggregated_candles(source, bucket_minutes)
        if candle["datetime"] < expected_bucket_start.isoformat()
    ]
    paged_candles: list[dict[str, object]] = []

    while True:
        response = client.get(
            "/candles",
            params={"symbol": "NDX", "timeframe": timeframe, "cursor": cursor, "limit": 2},
        )

        assert response.status_code == 200
        page = response.json()
        candles = page["candles"]
        page_datetimes = [candle["datetime"] for candle in candles]
        assert page_datetimes == sorted(page_datetimes)
        assert set(page_datetimes).isdisjoint(candle["datetime"] for candle in paged_candles)
        assert all(candle["datetime"] < expected_bucket_start.isoformat() for candle in candles)
        paged_candles.extend(candles)
        if not page["has_more"]:
            assert page["next_cursor"] is None
            break
        cursor = page["next_cursor"]
        assert cursor == page_datetimes[0]

    candles_by_datetime = sorted(paged_candles, key=lambda candle: str(candle["datetime"]))
    assert [candle["datetime"] for candle in candles_by_datetime] == [
        candle["datetime"] for candle in expected
    ]
    for actual, expected_candle in zip(candles_by_datetime, expected, strict=True):
        assert_aggregated_candle_matches(actual, expected_candle)


def test_one_minute_cursor_semantics_remain_unmodified(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    source = make_aggregation_database(str(database))
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get(
        "/candles",
        params={
            "symbol": "NDX",
            "timeframe": "1m",
            "cursor": datetime(2025, 1, 1, 1, 0, 30).isoformat(),
            "limit": 1,
        },
    )

    assert response.status_code == 200
    candle = response.json()["candles"][0]
    expected_row = next(row for row in source if row[0] == datetime(2025, 1, 1, 1, 0))
    assert candle["datetime"] == expected_row[0].isoformat()
    assert candle["OPEN"] == expected_row[1]
    assert candle["close"] == expected_row[4]


def test_omitted_timeframe_defaults_to_1m(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=5)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX"})

    assert response.status_code == 200
    assert response.json()["timeframe"] == "1m"


def test_timeframes_endpoint(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/timeframes")

    assert response.status_code == 200
    assert response.json() == ["1m", "5m", "15m", "1h"]


def test_cursor_windows_are_ordered_and_non_overlapping(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=5)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    first = client.get("/candles", params={"symbol": "NDX", "limit": 2}).json()
    second = client.get(
        "/candles", params={"symbol": "NDX", "cursor": first["next_cursor"], "limit": 2}
    ).json()
    terminal = client.get(
        "/candles", params={"symbol": "NDX", "cursor": second["next_cursor"], "limit": 2}
    ).json()

    first_times = [candle["datetime"] for candle in first["candles"]]
    second_times = [candle["datetime"] for candle in second["candles"]]
    assert first_times == sorted(first_times)
    assert second_times == sorted(second_times)
    assert set(first_times).isdisjoint(second_times)
    assert terminal["has_more"] is False
    assert terminal["next_cursor"] is None
    assert terminal["candles"] == [
        {
            "datetime": "2025-01-01T00:00:00",
            "symbol": "NDX",
            "OPEN": 1.0,
            "high": 2.0,
            "low": 0.5,
            "close": 1.5,
            "tickvol": 0,
            "volume": 0,
            "spread": 1,
            "origen": "test",
            "fecha_carga": "2025-01-01T00:00:00",
        }
    ]


def test_empty_catalog_returns_an_explicit_empty_result_without_a_fallback(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=0)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/symbols")

    assert response.status_code == 200
    assert response.json() == {"symbols": []}
    assert client.get("/candles", params={"symbol": "NDX"}).status_code == 400
    assert client.get("/candles").status_code == 400
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200


def test_explicit_empty_symbol_is_rejected(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    omitted_response = client.get("/candles")
    empty_response = client.get("/candles?symbol=")

    assert omitted_response.status_code == 200
    assert omitted_response.json()["symbol"] == "NDX"
    assert empty_response.status_code == 400
    assert empty_response.json() == {
        "type": "unsupported_symbol",
        "title": "Unsupported market symbol",
        "detail": "Symbol '' is not present in the discovered catalog.",
        "symbol": "",
    }


def test_invalid_cursor_and_limit_are_rejected(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    assert (
        client.get("/candles", params={"symbol": "NDX", "cursor": "not-a-date"}).status_code
        == 422
    )
    assert client.get("/candles", params={"symbol": "NDX", "limit": 0}).status_code == 422
    assert client.get("/candles", params={"symbol": "NDX", "limit": 201}).status_code == 422


def test_lower_limit_boundary_returns_one_candle(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=2)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "NDX", "limit": 1})

    assert response.status_code == 200
    assert len(response.json()["candles"]) == 1


def test_missing_database_is_typed_service_unavailable(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    repository = DuckDbCandleRepository(tmp_path / "missing.duckdb")
    client = TestClient(create_app(repository))

    response = client.get("/candles", params={"symbol": "NDX"})

    assert response.status_code == 503
    assert response.json()["type"] == "service_unavailable"
    assert any('"path": "/candles"' in record.message for record in caplog.records)


def test_health_and_ready_emit_success_events_when_database_is_available(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="app.database")
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    health_response = client.get("/health")
    ready_response = client.get("/ready")

    assert health_response.status_code == 200
    assert health_response.json() == {"status": "ok"}
    assert ready_response.status_code == 200
    assert ready_response.json() == {"status": "ready"}
    assert any('"event": "database_health"' in record.message for record in caplog.records)
    assert any('"event": "database_readiness"' in record.message for record in caplog.records)


def test_client_observability_events_are_structured_and_bounded(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="app.database")
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.post(
        "/client-events",
        json={
            "kind": "api_failure",
            "message": "Unable to load candles (503)",
            "path": "/",
        },
    )

    assert response.status_code == 202
    assert any(
        '"event": "client_observability"' in record.message
        and '"kind": "api_failure"' in record.message
        for record in caplog.records
    )
    assert client.post(
        "/client-events",
        json={"kind": "unknown", "message": "x", "path": "/"},
    ).status_code == 422
    client.get("/candles", params={"symbol": "NDX"})
    assert any(
        '"duration_ms":' in record.message
        and '"event": "candle_request"' in record.message
        for record in caplog.records
    )


def test_health_and_ready_emit_unavailable_events_when_database_is_missing(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("ERROR", logger="app.database")
    repository = DuckDbCandleRepository(tmp_path / "missing.duckdb")
    client = TestClient(create_app(repository))

    health_response = client.get("/health")
    ready_response = client.get("/ready")

    expected_response = {
        "type": "service_unavailable",
        "title": "Market data service unavailable",
        "detail": "market database is unavailable",
    }
    assert health_response.status_code == 503
    assert health_response.json() == expected_response
    assert ready_response.status_code == 503
    assert ready_response.json() == expected_response
    assert any(
        '"event": "database_health"' in record.message
        and '"status": "unavailable"' in record.message
        for record in caplog.records
    )
    assert any(
        '"event": "database_readiness"' in record.message
        and '"status": "unavailable"' in record.message
        for record in caplog.records
    )


def test_source_read_does_not_write_database(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=3)
    before = database.read_bytes()

    repository = DuckDbCandleRepository(database)
    repository.list_symbols()
    CandleWindowService(repository).get_window("NDX", "1m", None, 2)

    assert database.read_bytes() == before


def test_database_failure_is_typed_at_repository_boundary(tmp_path: Path) -> None:
    repository = DuckDbCandleRepository(tmp_path / "missing.duckdb")
    with pytest.raises(DatabaseUnavailable):
        repository.read_window("NDX", "1m", None, 1)


def test_symbols_are_distinct_non_empty_and_deterministically_sorted(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=0)
    insert_symbols(str(database), ["SPX", "NDX", "SPX", "", "   ", None])
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/symbols")

    assert response.status_code == 200
    assert response.json() == {"symbols": ["NDX", "SPX"]}


def test_symbols_database_unavailable_has_catalog_specific_typed_response(tmp_path: Path) -> None:
    client = TestClient(create_app(DuckDbCandleRepository(tmp_path / "missing.duckdb")))

    response = client.get("/symbols")

    assert response.status_code == 503
    assert response.json() == {
        "type": "service_unavailable",
        "title": "Market symbol catalog unavailable",
        "detail": "market database is unavailable",
    }


def test_symbol_catalog_request_emits_duration_and_status(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level("INFO", logger="app.database")
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    assert client.get("/symbols").status_code == 200
    assert any(
        '"event": "symbol_catalog_request"' in record.message
        and '"duration_ms":' in record.message
        and '"status_code": 200' in record.message
        for record in caplog.records
    )


def test_openapi_documents_the_symbol_catalog_contract(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    schema = client.get("/openapi.json").json()

    assert schema["paths"]["/symbols"]["get"]["responses"]["200"]["content"]["application/json"][
        "schema"
    ]["$ref"] == "#/components/schemas/SymbolCatalog"
    assert schema["paths"]["/symbols"]["get"]["responses"]["503"]["content"]["application/json"][
        "schema"
    ]["$ref"] == "#/components/schemas/ServiceUnavailable"
