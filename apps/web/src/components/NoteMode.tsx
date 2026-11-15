import { useEffect, useState } from 'react';
import { api } from '../data';
import { Close } from './Icons';
import { NoteArrows } from './NoteMarks';

/** Notizen-Modus: Knopf unten rechts. Im Modus sind die Pfeile zu ziehen (verschieben), anzutippen (bearbeiten) und mit × zu löschen.
 *  Ein Tipp auf eine freie Stelle legt eine neue Notiz an. Außerhalb des Modus zeigen die Pfeile nur. */
interface Note {
  id: number;
  text: string;
  target: string;
  route: string;
  done: boolean;
  anchor: string | null;
  fx: number | null;
  fy: number | null;
}

/** Stelle, an der getippt wurde: neue Notiz mit Seite und Bereich. */
interface Pick {
  target: string;
  route: string;
  anchor?: string;
  fx?: number;
  fy?: number;
}

/** Bereich der Stelle: data-note, sonst aria-label/Überschrift/Zeile, Text gekürzt. */
function labelOf(el: Element): { label: string; key?: string; box?: DOMRect } {
  const named = el.closest<HTMLElement>('[data-note],[aria-label],section,li,button');
  const key = named?.dataset.note ?? named?.getAttribute('aria-label') ?? undefined;
  const raw = key ?? named?.textContent ?? '';
  return { label: raw.replace(/\s+/g, ' ').trim().slice(0, 80), key, box: named?.getBoundingClientRect() };
}

const send = (method: string, path: string, body?: unknown) =>
  api(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export function NoteMode() {
  const [live, setLive] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [pick, setPick] = useState<Pick | null>(null);
  const [edit, setEdit] = useState<{ note: Note; text: string } | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'saved'>('idle');

  const load = () =>
    api('/api/notes')
      .then((r) => (r.ok ? (r.json() as Promise<Note[]>) : []))
      .then(setNotes)
      .catch(() => undefined);

  useEffect(() => {
    load();
    window.addEventListener('notes:changed', load);
    return () => window.removeEventListener('notes:changed', load);
  }, []);

  const sheetOpen = !!pick || !!edit;

  // Im Modus: Klick auf eine freie Stelle = neue Notiz; Klicks auf Notiz-Elemente gehören den Notiz-Bausteinen
  useEffect(() => {
    if (!live || sheetOpen) return;
    document.body.classList.add('notes-on');
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || el.closest('.note-ui')) return;
      e.preventDefault();
      e.stopPropagation();
      const { label, key, box } = labelOf(el);
      const inside = (v: number, size: number) => Math.min(1, Math.max(0, v / size));
      const pos = key && box && box.width > 0 && box.height > 0
        ? { anchor: key, fx: inside(e.clientX - box.left, box.width), fy: inside(e.clientY - box.top, box.height) }
        : {};
      setPick({ target: label, route: location.hash, ...pos });
      setText('');
      setState('idle');
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.body.classList.remove('notes-on');
    };
  }, [live, sheetOpen]);

  const closeAll = () => {
    setPick(null);
    setEdit(null);
    setLive(false);
  };

  const save = async () => {
    if (!pick || !text.trim()) return;
    setState('busy');
    try {
      const r = await send('POST', '/api/notes', { ...pick, text });
      if (!r.ok) throw new Error(String(r.status));
      setState('saved');
      window.dispatchEvent(new Event('notes:changed'));
      setTimeout(() => setPick(null), 700);
    } catch {
      setState('error');
    }
  };

  const saveEdit = async () => {
    if (!edit || !edit.text.trim()) return;
    const r = await send('PATCH', `/api/notes/${edit.note.id}`, { text: edit.text });
    if (r.ok) {
      setEdit(null);
      window.dispatchEvent(new Event('notes:changed'));
    }
  };

  const remove = async (id: number) => {
    const r = await send('DELETE', `/api/notes/${id}`);
    if (r.ok || r.status === 404) {
      setEdit(null);
      window.dispatchEvent(new Event('notes:changed'));
    }
  };

  const arrows = notes.filter((n): n is Note & { anchor: string; fx: number; fy: number } => !!n.anchor && n.fx != null && n.fy != null && !n.done);

  return (
    <>
      <NoteArrows
        notes={arrows}
        live={live && !sheetOpen}
        onTap={(n) => setEdit({ note: notes.find((x) => x.id === n.id)!, text: n.text })}
        onDelete={(n) => void remove(n.id)}
        onMoved={() => window.dispatchEvent(new Event('notes:changed'))}
      />
      {live && !sheetOpen && (
        <div className="note-ui note-hint" role="status">
          <span>Ziehen = verschieben · Tippen = bearbeiten · × = löschen · freie Stelle = neue Notiz</span>
          <button type="button" onClick={closeAll} aria-label="Notizen beenden">
            <Close size={18} />
          </button>
        </div>
      )}
      {!live && !sheetOpen && (
        <button type="button" className="note-ui note-fab" onClick={() => setLive(true)}>
          Notizen{notes.length ? ` · ${notes.length}` : ''}
        </button>
      )}
      {pick && (
        <div className="note-ui note-sheet" role="dialog" aria-label="Neue Notiz">
          <header>
            <b>Neue Notiz</b>
            <button type="button" onClick={() => setPick(null)} aria-label="Abbrechen">
              <Close size={18} />
            </button>
          </header>
          <p className="note-target">{pick.target || 'Allgemein'}</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={1000} placeholder="Was soll anders sein?" autoFocus />
          <div className="note-actions">
            <button type="button" className="note-save" disabled={!text.trim() || state === 'busy' || state === 'saved'} onClick={save}>
              {state === 'saved' ? 'Gespeichert' : state === 'busy' ? 'Speichere …' : 'Speichern'}
            </button>
            {state === 'error' && <small>Speichern fehlgeschlagen</small>}
          </div>
        </div>
      )}
      {edit && (
        <div className="note-ui note-sheet" role="dialog" aria-label="Notiz bearbeiten">
          <header>
            <b>Notiz {edit.note.id}</b>
            <button type="button" onClick={() => setEdit(null)} aria-label="Schließen">
              <Close size={18} />
            </button>
          </header>
          <p className="note-target">{edit.note.target || 'Allgemein'}</p>
          <textarea value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} rows={3} maxLength={1000} autoFocus />
          <div className="note-actions">
            <button type="button" className="note-save" disabled={!edit.text.trim()} onClick={saveEdit}>
              Speichern
            </button>
            <button type="button" className="note-del" onClick={() => void remove(edit.note.id)}>
              Löschen
            </button>
          </div>
        </div>
      )}
    </>
  );
}
