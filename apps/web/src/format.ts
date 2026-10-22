const nf = (d: number) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: d, minimumFractionDigits: d });

export interface Fmt {
  value: string;
  unit: string;
}

export function power(w: number | null | undefined): Fmt {
  if (w === null || w === undefined || Number.isNaN(w)) return { value: '–', unit: '' };
  const a = Math.abs(w);
  if (a < 1000) return { value: nf(0).format(a), unit: 'W' };
  return { value: nf(a < 10_000 ? 2 : 1).format(a / 1000), unit: 'kW' };
}

export function energy(kwh: number | null | undefined): Fmt {
  if (kwh === null || kwh === undefined || Number.isNaN(kwh)) return { value: '–', unit: '' };
  const a = Math.abs(kwh);
  if (a < 1) return { value: nf(0).format(a * 1000), unit: 'Wh' };
  if (a < 100) return { value: nf(1).format(a), unit: 'kWh' };
  if (a < 1000) return { value: nf(0).format(a), unit: 'kWh' };
  return { value: nf(2).format(a / 1000), unit: 'MWh' };
}

/** Kompakt für die Grafik: MWh mit einer Nachkommastelle. */
export function energyShort(kwh: number | null | undefined): Fmt {
  const f = energy(kwh);
  if (f.unit !== 'MWh' || kwh === null || kwh === undefined) return f;
  return { value: nf(1).format(Math.abs(kwh) / 1000), unit: 'MWh' };
}

export const join = (f: Fmt) => (f.unit ? `${f.value} ${f.unit}` : f.value);

export function pct(x: number | null | undefined): string {
  return x === null || x === undefined ? '–' : `${nf(0).format(x * 100)} %`;
}

export function num(x: number | null | undefined, d = 1, unit = ''): string {
  return x === null || x === undefined ? '–' : `${nf(d).format(x)}${unit ? ` ${unit}` : ''}`;
}

export function clock(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
}
