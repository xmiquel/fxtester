from collections.abc import Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

import pandas as pd  # type: ignore[import-untyped]

StrategyParameterKind = Literal["integer", "number", "boolean", "string"]
StrategyParameterValue = int | float | bool | str


@dataclass(frozen=True)
class StrategyParameterDefinition:
    name: str
    label: str
    kind: StrategyParameterKind
    default: StrategyParameterValue
    minimum: int | float | None = None
    maximum: int | float | None = None


@dataclass(frozen=True)
class StrategyDefinition:
    name: str
    label: str
    description: str
    parameters: tuple[StrategyParameterDefinition, ...]


@dataclass(frozen=True)
class StrategyResult:
    final_value: float
    total_return: float
    max_drawdown: float
    sharpe_ratio: float | None
    total_trades: int


class Strategy(Protocol):
    name: str
    definition: StrategyDefinition

    def validate_parameters(self, parameters: Mapping[str, object]) -> dict[str, object]: ...

    def run(
        self,
        close: pd.Series,
        parameters: Mapping[str, object],
        initial_cash: float,
        fees: float,
        slippage: float,
        frequency: str,
    ) -> StrategyResult: ...
