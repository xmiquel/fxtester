import type { components } from "../../api/generated";

type Candle = components["schemas"]["Candle"];

interface DataWindowProps {
  candle: Candle | null;
  id: string;
  timeZone: string;
}

interface DataWindowRowProps {
  label: string;
  value: number | string;
}

function DataWindowRow({ label, value }: DataWindowRowProps) {
  return (
    <div className="data-window-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function DataWindow({ candle, id, timeZone }: DataWindowProps) {
  return (
    <aside aria-label="Candle data window" aria-live="polite" className="data-window" id={id}>
      <p
        aria-label={candle === null ? "No candle selected." : undefined}
        className="visually-hidden"
        role="status"
      >
        {candle === null ? "No candle selected." : ""}
      </p>
      <dl>
        <DataWindowRow label={`Timestamp (${timeZone})`} value={candle?.datetime ?? ""} />
        <DataWindowRow label="Open" value={candle?.OPEN ?? ""} />
        <DataWindowRow label="High" value={candle?.high ?? ""} />
        <DataWindowRow label="Low" value={candle?.low ?? ""} />
        <DataWindowRow label="Close" value={candle?.close ?? ""} />
        <DataWindowRow label="Volume" value={candle?.volume ?? ""} />
      </dl>
    </aside>
  );
}
