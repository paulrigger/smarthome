import type { Fmt } from '../format';

export function Kpi({ label, value, hint }: { label: string; value: Fmt; hint?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value.value}
        {value.unit && <small>{value.unit}</small>}
        {hint && <span className="hint">{hint}</span>}
      </dd>
    </div>
  );
}
