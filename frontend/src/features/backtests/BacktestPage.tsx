import { useEffect, useState, type FormEvent } from "react";

import { SymbolSelector } from "../candles/SymbolSelector";
import { TimeframeSelector } from "../candles/TimeframeSelector";
import type {
  BacktestRequest,
  BacktestResponse,
  StrategyDefinition,
  StrategyParameterDefinition,
} from "./api";
import { useBacktestStrategies } from "./useBacktestStrategies";
import { useRunBacktest } from "./useRunBacktest";

export const BACKTEST_PERIODS = [500, 1000, 5000] as const;

type ParameterValue = StrategyParameterDefinition["default"];

interface BacktestPageProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  symbols: string[];
  timeframes: string[];
  onSelectSymbol: (symbol: string) => void;
  onSelectTimeframe: (timeframe: string) => void;
}

interface ParameterFieldProps {
  definition: StrategyParameterDefinition;
  value: ParameterValue;
  onChange: (name: string, value: ParameterValue) => void;
}

interface MetricProps {
  label: string;
  value: string;
}

const numberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function formatPercent(value: number): string {
  return `${formatNumber(value * 100)}%`;
}

function formatDateTime(value: string | null): string {
  return value ?? "Unavailable";
}

function strategyFor(
  strategies: StrategyDefinition[] | undefined,
  selectedStrategy: string,
): StrategyDefinition | undefined {
  return strategies?.find((strategy) => strategy.name === selectedStrategy);
}

function ParameterField({ definition, value, onChange }: ParameterFieldProps) {
  if (definition.kind === "boolean") {
    return (
      <label className="checkbox-field">
        <input
          checked={value === true}
          name={definition.name}
          onChange={(event) => onChange(definition.name, event.target.checked)}
          type="checkbox"
        />
        {definition.label}
      </label>
    );
  }

  const inputType = definition.kind === "string" ? "text" : "number";
  return (
    <label>
      {definition.label}
      <input
        max={definition.maximum ?? undefined}
        min={definition.minimum ?? undefined}
        name={definition.name}
        onChange={(event) => {
          const nextValue = definition.kind === "string" ? event.target.value : Number(event.target.value);
          onChange(definition.name, nextValue);
        }}
        step={definition.kind === "integer" ? 1 : "any"}
        type={inputType}
        value={String(value)}
      />
    </label>
  );
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="metric-card">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

interface ResultPanelProps {
  result: BacktestResponse;
  strategy: StrategyDefinition | undefined;
}

function ResultPanel({ result, strategy }: ResultPanelProps) {
  return (
    <section aria-labelledby="backtest-result-title" aria-live="polite" className="result-panel" role="status">
      <div className="chart-toolbar">
        <div>
          <p className="eyebrow">Completed evaluation</p>
          <h2 id="backtest-result-title">{strategy?.label ?? result.strategy}</h2>
        </div>
        <p>{result.strategy}</p>
      </div>
      <dl className="result-grid">
        <Metric label="Symbol" value={result.symbol} />
        <Metric label="Timeframe" value={result.timeframe} />
        <Metric label="Evaluation start" value={formatDateTime(result.start_datetime)} />
        <Metric label="Evaluation end" value={formatDateTime(result.end_datetime)} />
        <Metric label="Candle count" value={formatInteger(result.candle_count)} />
        <Metric label="Initial cash" value={formatNumber(result.initial_cash)} />
        <Metric label="Final value" value={formatNumber(result.final_value)} />
        <Metric label="Total return" value={formatPercent(result.total_return)} />
        <Metric label="Max drawdown" value={formatPercent(result.max_drawdown)} />
        <Metric label="Sharpe ratio" value={result.sharpe_ratio === null ? "Unavailable" : formatNumber(result.sharpe_ratio)} />
        <Metric label="Total trades" value={formatInteger(result.total_trades)} />
      </dl>
    </section>
  );
}

export function BacktestPage({
  selectedSymbol,
  selectedTimeframe,
  symbols,
  timeframes,
  onSelectSymbol,
  onSelectTimeframe,
}: BacktestPageProps) {
  const strategiesQuery = useBacktestStrategies();
  const runBacktest = useRunBacktest();
  const [selectedStrategy, setSelectedStrategy] = useState("");
  const [period, setPeriod] = useState<number>(BACKTEST_PERIODS[0]);
  const [parameters, setParameters] = useState<Record<string, ParameterValue>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [lastRequest, setLastRequest] = useState<BacktestRequest | null>(null);
  const selectedDefinition = strategyFor(strategiesQuery.data, selectedStrategy);

  useEffect(() => {
    const firstStrategy = strategiesQuery.data?.[0];
    if (firstStrategy && !strategyFor(strategiesQuery.data, selectedStrategy)) {
      setSelectedStrategy(firstStrategy.name);
    }
  }, [selectedStrategy, strategiesQuery.data]);

  useEffect(() => {
    if (selectedDefinition) {
      setParameters(
        Object.fromEntries(
          selectedDefinition.parameters.map((parameter) => [parameter.name, parameter.default]),
        ),
      );
      setValidationError(null);
    }
  }, [selectedDefinition]);

  const updateParameter = (name: string, value: ParameterValue) => {
    setParameters((current) => ({ ...current, [name]: value }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedDefinition) {
      setValidationError("Select a strategy before running the backtest.");
      return;
    }
    if (!event.currentTarget.checkValidity()) {
      setValidationError("Review the strategy parameters before running the backtest.");
      return;
    }

    setValidationError(null);
    const request: BacktestRequest = {
      fees: 0,
      initial_cash: 10000,
      limit: period,
      parameters,
      slippage: 0,
      strategy: selectedDefinition.name,
      symbol: selectedSymbol,
      timeframe: selectedTimeframe,
    };
    setLastRequest(request);
    runBacktest.mutate(request);
  };

  if (strategiesQuery.isPending) {
    return <p role="status">Loading backtest strategies…</p>;
  }
  if (strategiesQuery.isError) {
    return (
      <div role="alert">
        <p>{strategiesQuery.error.message}</p>
        <button onClick={() => void strategiesQuery.refetch()} type="button">
          Retry loading strategies
        </button>
      </div>
    );
  }
  if (!strategiesQuery.data || strategiesQuery.data.length === 0) {
    return <p role="status">No backtest strategies are registered.</p>;
  }

  return (
    <section aria-labelledby="backtest-title" className="workspace-panel">
      <header className="backtest-header">
        <p className="eyebrow">Historical analysis</p>
        <h2 id="backtest-title">Backtest a strategy</h2>
        <p>Select market context, strategy inputs, and a bounded candle window to evaluate historical performance.</p>
      </header>
      <form className="backtest-form" onSubmit={submit}>
        <div className="form-grid">
          <SymbolSelector onSelect={onSelectSymbol} selectedSymbol={selectedSymbol} symbols={symbols} />
          <TimeframeSelector
            onSelect={onSelectTimeframe}
            selectedTimeframe={selectedTimeframe}
            timeframes={timeframes}
          />
          <label htmlFor="strategy-selector">
            Strategy
            <select
              id="strategy-selector"
              onChange={(event) => {
                setSelectedStrategy(event.target.value);
                runBacktest.reset();
              }}
              value={selectedStrategy}
            >
              {strategiesQuery.data.map((strategy) => (
                <option key={strategy.name} value={strategy.name}>
                  {strategy.label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="evaluation-period-selector">
            Evaluation period/window
            <select
              id="evaluation-period-selector"
              onChange={(event) => setPeriod(Number(event.target.value))}
              value={period}
            >
              {BACKTEST_PERIODS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset.toLocaleString("en-US")} candles
                </option>
              ))}
            </select>
          </label>
        </div>
        {selectedDefinition && (
          <fieldset className="parameter-fieldset">
            <legend>{selectedDefinition.label} parameters</legend>
            <p>{selectedDefinition.description}</p>
            <div className="form-grid parameter-grid">
              {selectedDefinition.parameters.map((parameter) => (
                <ParameterField
                  definition={parameter}
                  key={parameter.name}
                  onChange={updateParameter}
                  value={parameters[parameter.name] ?? parameter.default}
                />
              ))}
            </div>
          </fieldset>
        )}
        {validationError && <p role="alert">{validationError}</p>}
        {runBacktest.isError && (
          <div role="alert">
            <p>{runBacktest.error.message}</p>
            <button
              onClick={() => {
                if (lastRequest) {
                  runBacktest.mutate(lastRequest);
                }
              }}
              type="button"
            >
              Retry backtest
            </button>
          </div>
        )}
        <div className="button-row">
          <button disabled={runBacktest.isPending} type="submit">
            {runBacktest.isPending ? "Running backtest…" : "Run backtest"}
          </button>
        </div>
      </form>
      {runBacktest.data && <ResultPanel result={runBacktest.data} strategy={selectedDefinition} />}
    </section>
  );
}
