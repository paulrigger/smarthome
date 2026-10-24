// Einstellungen der App (gelten für alle Geräte): Schlüssel → JSON.
import type { DatabaseSync } from 'node:sqlite';

export interface SettingsStore {
  get<T>(key: string): T | null;
  put(key: string, value: unknown): void;
}

export function openSettingsStore(db: DatabaseSync): SettingsStore {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const sel = db.prepare('SELECT data FROM settings WHERE key = ?');
  const up = db.prepare('INSERT INTO settings (key, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at');
  return {
    get: <T>(key: string) => {
      const row = sel.get(key) as { data: string } | undefined;
      return row ? (JSON.parse(row.data) as T) : null;
    },
    put: (key, value) => {
      up.run(key, JSON.stringify(value), new Date().toISOString());
    },
  };
}
