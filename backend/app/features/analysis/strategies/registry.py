from collections.abc import Mapping

from app.features.analysis.strategies.base import Strategy, StrategyDefinition
from app.features.analysis.strategies.sma_cross import SmaCrossStrategy


class UnsupportedStrategyError(ValueError):
    def __init__(self, strategy: str) -> None:
        self.strategy = strategy
        super().__init__(f"Strategy '{strategy}' is not registered.")


class InvalidStrategyParametersError(ValueError):
    def __init__(self, strategy: str, detail: str) -> None:
        self.strategy = strategy
        self.detail = detail
        super().__init__(f"Invalid parameters for strategy '{strategy}': {detail}")


class StrategyRegistry:
    def __init__(self, strategies: Mapping[str, Strategy] | None = None) -> None:
        self._strategies = dict(strategies or {"sma_cross": SmaCrossStrategy()})

    def get(self, name: str) -> Strategy:
        strategy = self._strategies.get(name)
        if strategy is None:
            raise UnsupportedStrategyError(name)
        return strategy

    def list_definitions(self) -> list[StrategyDefinition]:
        return [strategy.definition for strategy in self._strategies.values()]

    def validate_parameters(
        self, name: str, parameters: Mapping[str, object]
    ) -> dict[str, object]:
        strategy = self.get(name)
        try:
            return strategy.validate_parameters(parameters)
        except ValueError as error:
            raise InvalidStrategyParametersError(name, str(error)) from error
