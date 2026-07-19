from datetime import datetime, timedelta

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.features.candles.window import (
    SOURCE_COLUMNS,
    DatabaseUnavailable,
    DuckDbCandleRepository,
)
from app.main import create_app


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


def test_candles_are_bounded_and_preserve_source_columns(tmp_path) -> None:
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


def test_unsupported_symbol_is_rejected(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"symbol": "SPX"})

    assert response.status_code == 400


def test_only_one_minute_timeframe_is_exposed(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"timeframe": "5m"})

    assert response.status_code == 400


def test_cursor_windows_are_ordered_and_non_overlapping(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=5)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    first = client.get("/candles", params={"limit": 2}).json()
    second = client.get("/candles", params={"cursor": first["next_cursor"], "limit": 2}).json()
    terminal = client.get("/candles", params={"cursor": second["next_cursor"], "limit": 2}).json()

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


def test_existing_empty_source_table_returns_the_documented_empty_window(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=0)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles")

    assert response.status_code == 200
    assert response.json() == {
        "symbol": "NDX",
        "timeframe": "1m",
        "candles": [],
        "next_cursor": None,
        "has_more": False,
    }


def test_invalid_cursor_and_limit_are_rejected(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=1)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    assert client.get("/candles", params={"cursor": "not-a-date"}).status_code == 422
    assert client.get("/candles", params={"limit": 0}).status_code == 422
    assert client.get("/candles", params={"limit": 201}).status_code == 422


def test_lower_limit_boundary_returns_one_candle(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=2)
    client = TestClient(create_app(DuckDbCandleRepository(database)))

    response = client.get("/candles", params={"limit": 1})

    assert response.status_code == 200
    assert len(response.json()["candles"]) == 1


def test_missing_database_is_typed_service_unavailable(tmp_path, caplog) -> None:
    repository = DuckDbCandleRepository(tmp_path / "missing.duckdb")
    client = TestClient(create_app(repository))

    response = client.get("/candles")

    assert response.status_code == 503
    assert response.json()["type"] == "service_unavailable"
    assert any('"path": "/candles"' in record.message for record in caplog.records)


def test_health_and_ready_emit_success_events_when_database_is_available(tmp_path, caplog) -> None:
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


def test_health_and_ready_emit_unavailable_events_when_database_is_missing(
    tmp_path, caplog
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


def test_source_read_does_not_write_database(tmp_path) -> None:
    database = tmp_path / "market.duckdb"
    make_database(str(database), count=3)
    before = database.read_bytes()

    DuckDbCandleRepository(database).read_window("NDX", None, 2)

    assert database.read_bytes() == before


def test_database_failure_is_typed_at_repository_boundary(tmp_path) -> None:
    repository = DuckDbCandleRepository(tmp_path / "missing.duckdb")
    with pytest.raises(DatabaseUnavailable):
        repository.read_window("NDX", None, 1)
