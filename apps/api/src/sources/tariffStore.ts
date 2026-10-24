// Tarife: je Tarif eine Zeile mit JSON.
import type { DatabaseSync } from 'node:sqlite';
import type { Tariff } from '@smarthome/shared';

export interface TariffStore {
  list(): Tariff[];
  replace(list: Tariff[]): void;
  /** Zähler, ändert sich bei jedem Speichern (für Cache-Schlüssel). */
  version(): number;
}

export function openTariffStore(db: DatabaseSync, seed: Tariff[]): TariffStore {
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
  if (count === 0) replace(seed);

  return {
    list: () =>
      (db.prepare('SELECT data FROM tariffs ORDER BY valid_from').all() as { data: string }[]).map((r) => JSON.parse(r.data) as Tariff),
    replace,
    version: () => rev,
  };
}
