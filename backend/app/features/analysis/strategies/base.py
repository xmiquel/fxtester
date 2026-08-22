from collections.abc import Mapping
from dataclasses import dataclass
from typing import Protocol

import pandas as pd  # type: ignore[import-untyped]


@dataclass(frozen=True)
class StrategyResult:
    final_value: float
    total_return: float
    max_drawdown: float
    sharpe_ratio: float | None
    total_trades: int


class Strategy(Protocol):
    name: str

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
