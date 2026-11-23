// EPEX-Spotpreise (Day-Ahead AT) von energy-charts.info (öffentlich, ohne Schlüssel). Gespeichert in SQLite (Tabellen spot_prices, spot_days).
// Ein Tag mit Preisen wird einmal geholt und bleibt dauerhaft. Tage ohne Preise (Folgetag vor der Veröffentlichung) werden höchstens alle 2 h erneut gefragt.
// Verteilung auf die Intervalle in packages/shared/src/spot.ts.
import type { DatabaseSync } from 'node:sqlite';
import { eurMwhToCt, type SpotPrices } from '@smarthome/shared';

const DAY = 86400_000;
const RETRY_EMPTY_MS = 2 * 3600_000;
const FAIL_TTL = 300_000;
const MAX_RUN_DAYS = 366;
const PAUSE_MS = 2000;

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
const dayMs = (day: string) => Date.parse(`${day}T00:00:00Z`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function openSpot(o: { mock: boolean; log: (msg: string) => void; db: DatabaseSync }) {
  const db = o.db;
  db.exec(`CREATE TABLE IF NOT EXISTS spot_prices (t TEXT PRIMARY KEY, ct REAL NOT NULL)`);
  db.exec(`CREATE TABLE IF NOT EXISTS spot_days (day TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, points INTEGER NOT NULL)`);
  const dayRow = db.prepare('SELECT fetched_at AS at, points FROM spot_days WHERE day = ?');
  const putDay = db.prepare('INSERT INTO spot_days (day, fetched_at, points) VALUES (?, ?, ?) ON CONFLICT(day) DO UPDATE SET fetched_at = excluded.fetched_at, points = excluded.points');
  const clearDay = db.prepare('DELETE FROM spot_prices WHERE t >= ? AND t < ?');
  const putPrice = db.prepare('INSERT INTO spot_prices (t, ct) VALUES (?, ?)');
  const readRange = db.prepare('SELECT t, ct FROM spot_prices WHERE t >= ? AND t < ? ORDER BY t');
  const failed = new Map<string, number>();
  let busy: Promise<void> = Promise.resolve(); // Abrufe nacheinander

  /** Tag fehlt, oder er war leer und die letzte Abfrage ist länger als 2 h her. */
  function needs(day: string, now: number): boolean {
    const row = dayRow.get(day) as { at: number; points: number } | undefined;
    if (!row) return true;
    return row.points === 0 && now - row.at > RETRY_EMPTY_MS;
  }

  async function fetchRun(first: string, last: string) {
    const end = dayKey(dayMs(last) + DAY);
    const r = await fetch(`https://api.energy-charts.info/price?bzn=AT&start=${first}&end=${end}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`energy-charts ${r.status}`);
    const j = (await r.json()) as { unix_seconds?: number[]; price?: number[]; unit?: string };
    if (!j.unix_seconds || !j.price || !String(j.unit ?? '').includes('MWh')) throw new Error('energy-charts: unerwartetes Format');
    const now = Date.now();
    const byDay = new Map<string, { t: string; ct: number }[]>();
    j.unix_seconds.forEach((s, i) => {
      const t = new Date(s * 1000).toISOString();
      const k = t.slice(0, 10);
      byDay.set(k, [...(byDay.get(k) ?? []), { t, ct: eurMwhToCt(j.price![i]) }]);
    });
    db.exec('BEGIN');
    try {
      for (let ms = dayMs(first); ms <= dayMs(last); ms += DAY) {
        const k = dayKey(ms);
        const pts = byDay.get(k) ?? [];
        clearDay.run(`${k}T00:00:00.000Z`, `${dayKey(ms + DAY)}T00:00:00.000Z`);
        for (const p of pts) putPrice.run(p.t, p.ct);
        putDay.run(k, now, pts.length);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  async function fill(first: string, last: string) {
    const now = Date.now();
    const missing: string[] = [];
    for (let ms = dayMs(first); ms <= dayMs(last); ms += DAY) {
      const k = dayKey(ms);
      const retry = !failed.has(k) || now - failed.get(k)! > FAIL_TTL;
      if (needs(k, now) && retry) missing.push(k);
    }
    let i = 0, first_req = true;
    while (i < missing.length) {
      let j = i;
      while (j + 1 < missing.length && j - i + 1 < MAX_RUN_DAYS && dayMs(missing[j + 1]) - dayMs(missing[j]) === DAY) j++;
      if (!first_req) await sleep(PAUSE_MS);
      first_req = false;
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
    const rows = readRange.all(`${first}T00:00:00.000Z`, `${dayKey(dayMs(last) + DAY)}T00:00:00.000Z`) as { t: string; ct: number }[];
    if (!rows.length && [...failed.keys()].some((k) => k >= first && k <= last)) throw new Error('energy-charts nicht erreichbar');
    return { t: rows.map((r) => r.t), ct: rows.map((r) => r.ct) };
  }
  return { get };
}
