// Notizen zur Oberfläche (Wunschliste/Fehler): Wo in der App (Route + Bereich) und was dazu. Speicher in SQLite (gleiche DB wie Tarife).
// Lesen per GET /api/notes; Erledigt-Markierung per PATCH. Keine Auswertung, nur Ablage.
import type { DatabaseSync } from 'node:sqlite';

export interface Note {
  id: number;
  created: string;
  /** Hash der Seite, z. B. "#/?detail=node:battery" */
  route: string;
  /** Bereich/Element, an dem getippt wurde (Text oder data-note) */
  target: string;
  text: string;
  done: boolean;
  /** Schlüssel des markierten Elements (data-note bzw. aria-label) für die Pfeilspitze */
  anchor: string | null;
  /** Tipp-Position im Element, Anteil 0..1 von Breite und Höhe */
  fx: number | null;
  fy: number | null;
}

export interface NoteInput {
  route: string;
  target: string;
  text: string;
  anchor?: string;
  fx?: number;
  fy?: number;
}

export interface NotesStore {
  add(input: NoteInput): Note;
  list(includeDone: boolean): Note[];
  setDone(id: number, done: boolean): Note | null;
  /** Pfeilspitze verschieben: Anteil im markierten Element */
  move(id: number, fx: number, fy: number): Note | null;
}

interface Row {
  id: number;
  created: string;
  route: string;
  target: string;
  text: string;
  done: number;
  anchor: string | null;
  fx: number | null;
  fy: number | null;
}

const toNote = (r: Row): Note => ({ ...r, done: r.done === 1 });

export function openNotesStore(db: DatabaseSync): NotesStore {
  db.exec(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created TEXT NOT NULL,
    route TEXT NOT NULL,
    target TEXT NOT NULL,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0
  )`);
  // Spalten für die Position (ältere Datenbanken nachrüsten)
  const have = (db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]).map((c) => c.name);
  for (const col of ['anchor TEXT', 'fx REAL', 'fy REAL']) if (!have.includes(col.split(' ')[0])) db.exec(`ALTER TABLE notes ADD COLUMN ${col}`);
  const ins = db.prepare('INSERT INTO notes (created, route, target, text, done, anchor, fx, fy) VALUES (?, ?, ?, ?, 0, ?, ?, ?) RETURNING *');
  const byId = db.prepare('SELECT * FROM notes WHERE id = ?');
  const all = db.prepare('SELECT * FROM notes ORDER BY id DESC');
  const open = db.prepare('SELECT * FROM notes WHERE done = 0 ORDER BY id DESC');
  const upd = db.prepare('UPDATE notes SET done = ? WHERE id = ?');
  const upd2 = db.prepare('UPDATE notes SET fx = ?, fy = ? WHERE id = ? AND anchor IS NOT NULL');
  return {
    add: (input) =>
      toNote(ins.get(new Date().toISOString(), input.route, input.target, input.text, input.anchor ?? null, input.fx ?? null, input.fy ?? null) as unknown as Row),
    list: (includeDone) => (includeDone ? all : open).all().map((r) => toNote(r as unknown as Row)),
    move: (id, fx, fy) => {
      upd2.run(fx, fy, id);
      const r = byId.get(id) as unknown as Row | undefined;
      return r ? toNote(r) : null;
    },
    setDone: (id, done) => {
      upd.run(done ? 1 : 0, id);
      const r = byId.get(id) as unknown as Row | undefined;
      return r ? toNote(r) : null;
    },
  };
}
