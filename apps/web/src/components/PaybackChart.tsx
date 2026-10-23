// Kumulierter Ertrag über die Zeit gegen die Investition, mit Prognose bis zur Amortisation.
import type { Payback } from '../pages/payback';
import { eur } from '../format';

const W = 340, H = 150, P = { l: 44, r: 10, t: 12, b: 22 };

export function PaybackChart({ p, color, label }: { p: Payback; color: string; label: string }) {
  if (!p.months.length) return null;
  const now = new Date();
  const x0 = p.since.getTime();
  const end = Math.max(now.getTime(), p.paybackAt?.getTime() ?? 0) + 120 * 864e5;
  const yMax = Math.max(p.invest, p.cum) * 1.1 || 1;
  const yMin = Math.min(0, ...p.months.map((m) => m.cum));
  const sx = (t: number) => P.l + ((t - x0) / (end - x0)) * (W - P.l - P.r);
  const sy = (v: number) => P.t + (1 - (v - yMin) / (yMax - yMin)) * (H - P.t - P.b);

  // Ist-Linie: Monatsende-Kumulation, Start bei 0
  const pts = [[x0, 0], ...p.months.map((m, i) => [Math.min(now.getTime(), p.months[i + 1]?.t.getTime() ?? now.getTime()), m.cum])];
  const d = pts.map(([t, v], i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
  const years: number[] = [];
  const y0 = p.since.getFullYear() + 1, y1 = new Date(end).getFullYear();
  const stepY = Math.max(1, Math.ceil((y1 - y0 + 1) / 6));
  for (let y = y0; y <= y1; y += stepY) years.push(y);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg payback-chart" role="img" aria-label={`${label}: ${eur(p.cum)} von ${eur(p.invest)} erwirtschaftet`}>
      <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} className="chart-base" />
      <line x1={P.l} x2={W - P.r} y1={sy(p.invest)} y2={sy(p.invest)} className="pb-invest" />
      <text x={P.l - 6} y={sy(p.invest) + 4} textAnchor="end" className="chart-tick">{eur(p.invest, true)}</text>
      <text x={P.l - 6} y={sy(0) + 4} textAnchor="end" className="chart-tick">0</text>
      {years.map((y) => {
        const t = new Date(y, 0, 1).getTime();
        return (
          <g key={y}>
            <line x1={sx(t)} x2={sx(t)} y1={P.t} y2={H - P.b} className="chart-vgrid" />
            <text x={sx(t)} y={H - 6} textAnchor="middle" className="chart-tick">{y}</text>
          </g>
        );
      })}
      <line x1={sx(now.getTime())} x2={sx(now.getTime())} y1={P.t} y2={H - P.b} className="chart-cross" />
      <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
      {p.paybackAt && !p.reached && (
        <line x1={sx(now.getTime())} y1={sy(p.cum)} x2={sx(p.paybackAt.getTime())} y2={sy(p.invest)} stroke={color} strokeWidth={2} strokeDasharray="5 5" />
      )}
      {p.paybackAt && <circle cx={sx(p.paybackAt.getTime())} cy={sy(p.invest)} r={5} fill={color} className="chart-dot" />}
    </svg>
  );
}
