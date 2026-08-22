import math
from collections.abc import Mapping
from typing import Any, cast

import pandas as pd  # type: ignore[import-untyped]
import vectorbt as vbt  # type: ignore[import-untyped]

from app.features.analysis.strategies.base import StrategyResult


class InvalidSmaCrossParameters(ValueError):
    pass


class SmaCrossStrategy:
    name = "sma_cross"
    _default_parameters = {"fast_window": 10, "slow_window": 30}

    def validate_parameters(self, parameters: Mapping[str, object]) -> dict[str, object]:
        unknown = set(parameters) - set(self._default_parameters)
        if unknown:
            names = ", ".join(sorted(unknown))
            raise InvalidSmaCrossParameters(f"unsupported parameter(s): {names}")

        validated: dict[str, object] = dict(self._default_parameters)
        for name, value in parameters.items():
            if isinstance(value, bool) or not isinstance(value, int) or value < 1:
                raise InvalidSmaCrossParameters(f"{name} must be a positive integer")
            validated[name] = value

        fast_window = cast(int, validated["fast_window"])
        slow_window = cast(int, validated["slow_window"])
        if fast_window >= slow_window:
            raise InvalidSmaCrossParameters("fast_window must be less than slow_window")
        return validated

    def run(
        self,
        close: pd.Series,
        parameters: Mapping[str, object],
        initial_cash: float,
        fees: float,
        slippage: float,
        frequency: str,
    ) -> StrategyResult:
        fast_window = cast(int, parameters["fast_window"])
        slow_window = cast(int, parameters["slow_window"])
        fast = close.rolling(fast_window).mean()
        slow = close.rolling(slow_window).mean()
        entries = ((fast > slow) & (fast.shift(1) <= slow.shift(1))).fillna(False)
        exits = ((fast < slow) & (fast.shift(1) >= slow.shift(1))).fillna(False)
        portfolio = _from_signals(
            close=close,
            entries=entries,
            exits=exits,
            initial_cash=initial_cash,
            fees=fees,
            slippage=slippage,
            frequency=frequency,
        )
        sharpe_value = float(portfolio.sharpe_ratio())
        return StrategyResult(
            final_value=float(portfolio.final_value()),
            total_return=float(portfolio.total_return()),
            max_drawdown=float(portfolio.max_drawdown()),
            sharpe_ratio=sharpe_value if math.isfinite(sharpe_value) else None,
            total_trades=int(portfolio.trades.count()),
        )


def _from_signals(
    *,
    close: pd.Series,
    entries: pd.Series,
    exits: pd.Series,
    initial_cash: float,
    fees: float,
    slippage: float,
    frequency: str,
) -> Any:
    return vbt.Portfolio.from_signals(
        close,
        entries=entries,
        exits=exits,
        fees=fees,
        slippage=slippage,
        init_cash=initial_cash,
        direction="longonly",
        freq=frequency,
    )
