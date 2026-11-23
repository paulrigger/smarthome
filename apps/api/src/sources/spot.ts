// EPEX-Spotpreise (Day-Ahead AT) von energy-charts.info (öffentlich, ohne Schlüssel). Verteilung auf die Intervalle in packages/shared/src/spot.ts.
// Cache je Tag: vergangene Tage dauerhaft, heute 1 h. Nach einem Fehler (z. B. 429) fünf Minuten Pause; bis dahin liefert die Quelle, was vorliegt.
import { eurMwhToCt, type SpotPrices } from '@smarthome/shared';

const DAY = 86400_000;
const TODAY_TTL = 3600_000;
const FAIL_TTL = 300_000;

interface Day {
  at: number;
  t: string[];
  ct: number[];
}

/** Demo-Preise (Mock/Tests): deterministisch je Viertelstunde, Tagesgang mit Abend-Spitze */
export function mockSpot(from: string, to: string): SpotPrices {
  const t: string[] = [], ct: number[] = [];
  const start = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`) + DAY;
  for (let ms = start; ms < end; ms += 15 * 60_000) {
    const h = new Date(ms).getUTCHours() + new Date(ms).getUTCMinutes() / 60;
    t.push(new Date(ms).toISOString());
    ct.push(Math.round((12 + 6 * Math.sin(((h - 6) / 24) * 2 * Math.PI) + 5 * Math.exp(-((h - 19) ** 2) / 4)) * 100) / 100);
  }
  return { t, ct };
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function openSpot(o: { mock: boolean; log: (msg: string) => void }) {
  const days = new Map<string, Day>();
  const failed = new Map<string, number>();
  let busy: Promise<void> = Promise.resolve(); // Abrufe nacheinander, damit parallele Anfragen nicht doppelt laufen

  async function fetchRun(first: string, last: string) {
    const end = dayKey(Date.parse(`${last}T00:00:00Z`) + DAY);
    const r = await fetch(`https://api.energy-charts.info/price?bzn=AT&start=${first}&end=${end}`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`energy-charts ${r.status}`);
    const j = (await r.json()) as { unix_seconds?: number[]; price?: number[]; unit?: string };
    if (!j.unix_seconds || !j.price || !String(j.unit ?? '').includes('MWh')) throw new Error('energy-charts: unerwartetes Format');
    const now = Date.now();
    const byDay = new Map<string, Day>();
    j.unix_seconds.forEach((s, i) => {
      const t = new Date(s * 1000).toISOString();
      const d = byDay.get(t.slice(0, 10)) ?? { at: now, t: [], ct: [] };
      d.t.push(t);
      d.ct.push(eurMwhToCt(j.price![i]));
      byDay.set(t.slice(0, 10), d);
    });
    // Auch Tage ohne Preise merken, sonst wird jeder Aufruf erneut gefragt
    for (let ms = Date.parse(`${first}T00:00:00Z`); ms <= Date.parse(`${last}T00:00:00Z`); ms += DAY) {
      const k = dayKey(ms);
      days.set(k, byDay.get(k) ?? { at: now, t: [], ct: [] });
    }
  }

  async function fill(first: string, last: string) {
    const now = Date.now();
    const today = dayKey(now);
    const missing: string[] = [];
    for (let ms = Date.parse(`${first}T00:00:00Z`); ms <= Date.parse(`${last}T00:00:00Z`); ms += DAY) {
      const k = dayKey(ms);
      const d = days.get(k);
      const stale = !d || (k === today && now - d.at > TODAY_TTL);
      const retry = !failed.has(k) || now - failed.get(k)! > FAIL_TTL;
      if (stale && retry) missing.push(k);
    }
    // zusammenhängende Tage in einem Abruf holen
    let i = 0;
    while (i < missing.length) {
      let j = i;
      while (j + 1 < missing.length && Date.parse(`${missing[j + 1]}T00:00:00Z`) - Date.parse(`${missing[j]}T00:00:00Z`) === DAY) j++;
      try {
        await fetchRun(missing[i], missing[j]);
      } catch (e) {
        o.log(`spot: ${(e as Error).message}`);
        for (let k = i; k <= j; k++) failed.set(missing[k], now);
      }
      i = j + 1;
    }
  }

  async function get(from: string, to: string): Promise<SpotPrices> {
    if (o.mock) return mockSpot(from, to);
    const first = dayKey(Date.parse(from)), last = dayKey(Date.parse(to));
    busy = busy.then(() => fill(first, last)).catch(() => undefined);
    await busy;
    const t: string[] = [], ct: number[] = [];
    for (let ms = Date.parse(`${first}T00:00:00Z`); ms <= Date.parse(`${last}T00:00:00Z`); ms += DAY) {
      const d = days.get(dayKey(ms));
      if (d) {
        t.push(...d.t);
        ct.push(...d.ct);
      }
    }
    if (!t.length && failed.size) throw new Error('energy-charts nicht erreichbar');
    return { t, ct };
  }
  return { get };
}
