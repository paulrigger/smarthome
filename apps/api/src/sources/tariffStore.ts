// Tarife: je Tarif eine Zeile mit JSON.
import type { DatabaseSync } from 'node:sqlite';
import type { Tariff } from '@smarthome/shared';

export interface TariffStore {
  list(): Tariff[];
  replace(list: Tariff[]): void;
  /** Zähler, ändert sich bei jedem Speichern (für Cache-Schlüssel). */
  version(): number;
}

/** legacy: frühere Startbestände – steht einer davon unverändert in der DB, wird er durch seed ersetzt. */
export function openTariffStore(db: DatabaseSync, seed: Tariff[], legacy: Tariff[][] = []): TariffStore {
  db.exec(`CREATE TABLE IF NOT EXISTS tariffs (
    valid_from TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const count = (db.prepare('SELECT COUNT(*) AS n FROM tariffs').get() as { n: number }).n;
  let rev = 0;

  const replace = (list: Tariff[]) => {
    const now = new Date().toISOString();
    const ins = db.prepare('INSERT INTO tariffs (valid_from, data, updated_at) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    try {
      db.exec('DELETE FROM tariffs');
      for (const t of list) ins.run(t.validFrom, JSON.stringify(t), now);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    rev++;
  };
  const stored = () => (db.prepare('SELECT data FROM tariffs ORDER BY valid_from').all() as { data: string }[]).map((r) => JSON.parse(r.data) as Tariff);
  const same = (a: Tariff[], b: Tariff[]) => JSON.stringify(a) === JSON.stringify([...b].sort((x, y) => x.validFrom.localeCompare(y.validFrom)));
  if (count === 0 || legacy.some((l) => same(stored(), l))) replace(seed);

  return {
    list: stored,
    replace,
    version: () => rev,
  };
}
