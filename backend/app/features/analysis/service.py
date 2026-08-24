from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Protocol, cast

import pandas as pd  # type: ignore[import-untyped]

from app.features.analysis.contracts import (
    BacktestRequest,
    BacktestResponse,
    StrategyDefinition,
    StrategyParameterDefinition,
)
from app.features.analysis.strategies.registry import StrategyRegistry
from app.features.candles.window import (
    UnsupportedSymbolError,
    UnsupportedTimeframeError,
    parse_timeframe,
)


class InvalidBacktestPeriodError(ValueError):
    """Raised when a backtest range is not ordered chronologically."""


class BacktestPeriodEmptyError(ValueError):
    """Raised when a valid backtest range contains no candle."""


class AnalysisDataRepository(Protocol):
    def list_symbols(self) -> list[str]: ...

    def read_series(
        self, symbol: str, timeframe: str, start_datetime: datetime, end_datetime: datetime
    ) -> list[dict[str, object]]: ...

    def read_bounds(self, symbol: str, timeframe: str) -> tuple[datetime, datetime] | None: ...


def candles_to_close_series(candles: Sequence[Mapping[str, object]]) -> pd.Series:
    return pd.Series(
        [float(cast(float, candle["close"])) for candle in candles],
        index=pd.DatetimeIndex([candle["datetime"] for candle in candles]),
        dtype="float64",
        name="close",
    )


def normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


class AnalysisService:
    def __init__(
        self, repository: AnalysisDataRepository, registry: StrategyRegistry | None = None
    ) -> None:
        self.repository = repository
        self.registry = registry or StrategyRegistry()

    def run(self, request: BacktestRequest) -> BacktestResponse:
        parsed_timeframe = parse_timeframe(request.timeframe)
        if parsed_timeframe is None:
            raise UnsupportedTimeframeError(request.timeframe)

        catalog = self.repository.list_symbols()
        if request.symbol not in catalog:
            raise UnsupportedSymbolError(request.symbol)

        start_datetime = normalize_datetime(request.start_datetime)
        end_datetime = normalize_datetime(request.end_datetime)
        if start_datetime > end_datetime:
            raise InvalidBacktestPeriodError(
                "start_datetime must be less than or equal to end_datetime"
            )

        parameters = self.registry.validate_parameters(request.strategy, request.parameters)
        candles = self.repository.read_series(
            request.symbol, parsed_timeframe.token, start_datetime, end_datetime
        )
        if not candles:
            raise BacktestPeriodEmptyError("No candle exists in the requested backtest period.")

        close = candles_to_close_series(candles)
        result = self.registry.get(request.strategy).run(
            close=close,
            parameters=parameters,
            initial_cash=request.initial_cash,
            fees=request.fees,
            slippage=request.slippage,
            frequency=f"{parsed_timeframe.bucket_seconds}s",
        )
        return BacktestResponse(
            symbol=request.symbol,
            timeframe=parsed_timeframe.token,
            strategy=request.strategy,
            start_datetime=cast(datetime, candles[0]["datetime"]),
            end_datetime=cast(datetime, candles[-1]["datetime"]),
            candle_count=len(candles),
            initial_cash=request.initial_cash,
            final_value=result.final_value,
            total_return=result.total_return,
            max_drawdown=result.max_drawdown,
            sharpe_ratio=result.sharpe_ratio,
            total_trades=result.total_trades,
        )

    def get_period(self, symbol: str, timeframe: str) -> tuple[datetime, datetime]:
        parsed_timeframe = parse_timeframe(timeframe)
        if parsed_timeframe is None:
            raise UnsupportedTimeframeError(timeframe)

        catalog = self.repository.list_symbols()
        if symbol not in catalog:
            raise UnsupportedSymbolError(symbol)

        bounds = self.repository.read_bounds(symbol, parsed_timeframe.token)
        if bounds is None:
            raise BacktestPeriodEmptyError(
                "No candle exists for the requested symbol and timeframe."
            )
        return bounds

    def list_strategies(self) -> list[StrategyDefinition]:
        return [
            StrategyDefinition(
                name=definition.name,
                label=definition.label,
                description=definition.description,
                parameters=[
                    StrategyParameterDefinition(
                        name=parameter.name,
                        label=parameter.label,
                        kind=parameter.kind,
                        default=parameter.default,
                        minimum=parameter.minimum,
                        maximum=parameter.maximum,
                    )
                    for parameter in definition.parameters
                ],
            )
            for definition in self.registry.list_definitions()
        ]
