from datetime import datetime, timedelta
from pathlib import Path

import duckdb
import pytest
from fastapi.testclient import TestClient

from app.features.analysis.service import candles_to_close_series
from app.features.analysis.strategies.registry import (
    InvalidStrategyParametersError,
    StrategyRegistry,
    UnsupportedStrategyError,
)
from app.features.candles.window import DuckDbCandleRepository
from app.main import create_app


def make_analysis_database(path: Path) -> None:
    connection = duckdb.connect(str(path))
    connection.execute(
        '''CREATE TABLE dt_ohlc_m1 (
            datetime TIMESTAMP, symbol VARCHAR, "OPEN" DOUBLE, high DOUBLE,
            low DOUBLE, "close" DOUBLE, tickvol BIGINT, volume BIGINT,
            spread BIGINT, origen VARCHAR, fecha_carga TIMESTAMP
        )'''
    )
    start = datetime(2025, 1, 1)
    closes = [100.0, 99.0, 98.0, 99.0, 101.0, 102.0, 100.0, 98.0, 99.0, 101.0]
    rows = [
        (
            start + timedelta(minutes=index),
            "NDX",
            close,
            close + 1,
            close - 1,
            close,
            index,
            index,
            1,
            "test",
            start,
        )
        for index, close in enumerate(closes)
    ]
    connection.executemany("INSERT INTO dt_ohlc_m1 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
    connection.close()


@pytest.fixture
def analysis_client(tmp_path: Path) -> TestClient:
    database = tmp_path / "market.duckdb"
    make_analysis_database(database)
    return TestClient(create_app(DuckDbCandleRepository(database)))


def test_strategy_registry_validates_sma_cross_parameters() -> None:
    registry = StrategyRegistry()

    assert registry.validate_parameters("sma_cross", {"fast_window": 2, "slow_window": 3}) == {
        "fast_window": 2,
        "slow_window": 3,
    }
    with pytest.raises(InvalidStrategyParametersError, match="fast_window must be less"):
        registry.validate_parameters("sma_cross", {"fast_window": 3, "slow_window": 2})
    with pytest.raises(InvalidStrategyParametersError, match="unsupported parameter"):
        registry.validate_parameters("sma_cross", {"expression": "import os"})
    with pytest.raises(UnsupportedStrategyError, match="not registered"):
        registry.get("uploaded_python")


def test_candles_map_to_a_chronological_close_series() -> None:
    series = candles_to_close_series(
        [
            {"datetime": "2025-01-01T00:00:00", "close": 100.0},
            {"datetime": "2025-01-01T00:01:00", "close": 101.5},
        ]
    )

    assert series.name == "close"
    assert series.index.is_monotonic_increasing
    assert series.tolist() == [100.0, 101.5]


def test_analysis_series_is_bounded_chronological_and_aggregated(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_analysis_database(database)

    candles = DuckDbCandleRepository(database).read_series("NDX", "5m", 2)

    assert len(candles) == 2
    assert [candle["datetime"] for candle in candles] == [
        datetime(2025, 1, 1, 0, 0),
        datetime(2025, 1, 1, 0, 5),
    ]
    assert [candle["close"] for candle in candles] == [101.0, 101.0]


def test_backtest_result_is_deterministic_and_typed(analysis_client: TestClient) -> None:
    payload = {
        "symbol": "NDX",
        "timeframe": "1M",
        "strategy": "sma_cross",
        "parameters": {"fast_window": 2, "slow_window": 3},
        "limit": 10,
        "initial_cash": 1000.0,
        "fees": 0.001,
        "slippage": 0.001,
    }

    first = analysis_client.post("/backtests", json=payload)
    second = analysis_client.post("/backtests", json=payload)

    assert first.status_code == 200
    body = first.json()
    assert body == second.json()
    assert set(body) == {
        "symbol",
        "timeframe",
        "strategy",
        "start_datetime",
        "end_datetime",
        "candle_count",
        "initial_cash",
        "final_value",
        "total_return",
        "max_drawdown",
        "sharpe_ratio",
        "total_trades",
    }
    assert body["symbol"] == "NDX"
    assert body["timeframe"] == "1m"
    assert body["start_datetime"] == "2025-01-01T00:00:00"
    assert body["end_datetime"] == "2025-01-01T00:09:00"
    assert body["candle_count"] == 10
    assert body["initial_cash"] == 1000.0
    assert body["total_trades"] == 2


@pytest.mark.parametrize(
    ("payload", "expected_status"),
    [
        ({"symbol": "SPX"}, 400),
        ({"symbol": "NDX", "timeframe": "1d"}, 400),
        ({"symbol": "NDX", "limit": 0}, 422),
        ({"symbol": "NDX", "limit": 5001}, 422),
        ({"symbol": "NDX", "initial_cash": 0}, 422),
        ({"symbol": "NDX", "fees": -0.1}, 422),
        ({"symbol": "NDX", "slippage": -0.1}, 422),
    ],
)
def test_backtest_validates_symbol_timeframe_and_bounds(
    analysis_client: TestClient, payload: dict[str, object], expected_status: int
) -> None:
    full_payload = {"strategy": "sma_cross", **payload}

    response = analysis_client.post("/backtests", json=full_payload)

    assert response.status_code == expected_status


def test_unsupported_strategy_is_a_typed_400(analysis_client: TestClient) -> None:
    response = analysis_client.post(
        "/backtests", json={"symbol": "NDX", "strategy": "not_registered"}
    )

    assert response.status_code == 400
    assert response.json() == {
        "type": "unsupported_strategy",
        "title": "Unsupported analysis strategy",
        "detail": "Strategy 'not_registered' is not registered.",
        "strategy": "not_registered",
    }


def test_invalid_strategy_parameters_are_a_typed_400(analysis_client: TestClient) -> None:
    response = analysis_client.post(
        "/backtests",
        json={
            "symbol": "NDX",
            "strategy": "sma_cross",
            "parameters": {"fast_window": 3, "slow_window": 2},
        },
    )

    assert response.status_code == 400
    assert response.json() == {
        "type": "invalid_strategy_parameters",
        "title": "Invalid analysis strategy parameters",
        "detail": (
            "Invalid parameters for strategy 'sma_cross': "
            "fast_window must be less than slow_window"
        ),
        "strategy": "sma_cross",
    }


def test_strategy_catalog_is_registry_driven_and_typed(analysis_client: TestClient) -> None:
    response = analysis_client.get("/backtests/strategies")

    assert response.status_code == 200
    assert response.json() == [
        {
            "name": "sma_cross",
            "label": "SMA crossover",
            "description": "Trade long when a fast simple moving average crosses above a slow one.",
            "parameters": [
                {
                    "name": "fast_window",
                    "label": "Fast window",
                    "kind": "integer",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 500,
                },
                {
                    "name": "slow_window",
                    "label": "Slow window",
                    "kind": "integer",
                    "default": 30,
                    "minimum": 2,
                    "maximum": 1000,
                },
            ],
        }
    ]


def test_unavailable_database_is_a_typed_503(tmp_path: Path) -> None:
    client = TestClient(create_app(DuckDbCandleRepository(tmp_path / "missing.duckdb")))

    response = client.post("/backtests", json={"symbol": "NDX", "strategy": "sma_cross"})

    assert response.status_code == 503
    assert response.json() == {
        "type": "service_unavailable",
        "title": "Market data service unavailable",
        "detail": "market database is unavailable",
    }


def test_backtest_does_not_mutate_the_source_database(tmp_path: Path) -> None:
    database = tmp_path / "market.duckdb"
    make_analysis_database(database)
    client = TestClient(create_app(DuckDbCandleRepository(database)))
    before = database.read_bytes()

    response = client.post(
        "/backtests",
        json={"symbol": "NDX", "strategy": "sma_cross", "limit": 10},
    )

    assert response.status_code == 200
    assert database.read_bytes() == before


def test_openapi_documents_backtest_contract(analysis_client: TestClient) -> None:
    schema = analysis_client.get("/openapi.json").json()
    operation = schema["paths"]["/backtests"]["post"]

    assert operation["requestBody"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/BacktestRequest"
    )
    assert operation["responses"]["200"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/BacktestResponse"
    )
    assert operation["responses"]["503"]["content"]["application/json"]["schema"]["$ref"] == (
        "#/components/schemas/ServiceUnavailable"
    )
    response_400 = operation["responses"]["400"]["content"]["application/json"]["schema"]
    assert {item["$ref"] for item in response_400["anyOf"]} == {
        "#/components/schemas/UnsupportedSymbol",
        "#/components/schemas/UnsupportedTimeframe",
        "#/components/schemas/UnsupportedStrategy",
        "#/components/schemas/InvalidStrategyParameters",
    }

    catalog_operation = analysis_client.get("/openapi.json").json()["paths"][
        "/backtests/strategies"
    ]["get"]
    catalog_schema = catalog_operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert catalog_schema["items"] == {"$ref": "#/components/schemas/StrategyDefinition"}
    assert catalog_schema["type"] == "array"
