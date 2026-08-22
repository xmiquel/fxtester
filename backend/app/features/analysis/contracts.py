from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.features.candles.window import DEFAULT_TIMEFRAME

BACKTEST_LIMIT = 5000


class BacktestRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=100)
    timeframe: str = Field(default=DEFAULT_TIMEFRAME, min_length=2, max_length=10)
    strategy: str = Field(min_length=1, max_length=100)
    parameters: dict[str, object] = Field(default_factory=dict)
    limit: int = Field(default=BACKTEST_LIMIT, ge=1, le=BACKTEST_LIMIT)
    initial_cash: float = Field(default=10000.0, gt=0, allow_inf_nan=False)
    fees: float = Field(default=0.0, ge=0, allow_inf_nan=False)
    slippage: float = Field(default=0.0, ge=0, allow_inf_nan=False)


class BacktestResponse(BaseModel):
    symbol: str
    timeframe: str
    strategy: str
    start_datetime: datetime | None
    end_datetime: datetime | None
    candle_count: int
    initial_cash: float
    final_value: float
    total_return: float
    max_drawdown: float
    sharpe_ratio: float | None
    total_trades: int


class StrategyParameterDefinition(BaseModel):
    name: str
    label: str
    kind: Literal["integer", "number", "boolean", "string"]
    default: int | float | bool | str
    minimum: int | float | None = None
    maximum: int | float | None = None


class StrategyDefinition(BaseModel):
    name: str
    label: str
    description: str
    parameters: list[StrategyParameterDefinition]


class UnsupportedStrategy(BaseModel):
    type: Literal["unsupported_strategy"]
    title: str
    detail: str
    strategy: str


class InvalidStrategyParameters(BaseModel):
    type: Literal["invalid_strategy_parameters"]
    title: str
    detail: str
    strategy: str
