// Eigene Daten der App in SQLite (node:sqlite, keine nativen Abhängigkeiten).
// Datei: DATA_DIR/smarthome.db (Docker: Volume /app/data). ':memory:' für Tests.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  return new DatabaseSync(file);
}
