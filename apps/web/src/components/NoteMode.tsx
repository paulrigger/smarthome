import { useEffect, useState } from 'react';
import { api } from '../data';
import { Close } from './Icons';

/** Notizen: Button unten rechts öffnet die Liste (bearbeiten, Stelle neu setzen, löschen). Neue Notiz = Stelle antippen.
 *  Die Pfeile auf der Seite sind in NoteMarks; hier geht es um Text und Position. */
interface Note {
  id: number;
  text: string;
  target: string;
  route: string;
  anchor: string | null;
  fx: number | null;
  fy: number | null;
}

/** Stelle, an der getippt wurde: neue Notiz (route + Bereich) oder neue Position einer bestehenden Notiz. */
interface Pick {
  target: string;
  route: string;
  anchor?: string;
  fx?: number;
  fy?: number;
}

type Mode = { kind: 'idle' } | { kind: 'add' } | { kind: 'place'; id: number };

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
  const [panel, setPanel] = useState(false);
  const [list, setList] = useState<Note[]>([]);
  const [mode, setMode] = useState<Mode>({ kind: 'idle' });
  const [pick, setPick] = useState<Pick | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<{ id: number; text: string } | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'saved'>('idle');

  const load = () =>
    api('/api/notes')
      .then((r) => (r.ok ? (r.json() as Promise<Note[]>) : []))
      .then(setList)
      .catch(() => undefined);

  useEffect(() => {
    load();
    window.addEventListener('notes:changed', load);
    return () => window.removeEventListener('notes:changed', load);
  }, []);

  // Stelle antippen (neue Notiz oder neue Position): Klick wird nur markiert, nicht bedient
  useEffect(() => {
    if (mode.kind === 'idle') return;
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
      if (mode.kind === 'place') {
        // Neue Stelle für bestehende Notiz (ohne Element: kein Pfeil)
        if (!pos.anchor) return;
        const id = mode.id;
        setMode({ kind: 'idle' });
        void send('PATCH', `/api/notes/${id}`, pos).then(() => window.dispatchEvent(new Event('notes:changed')));
        return;
      }
      setPick({ target: label, route: location.hash, ...pos });
      setText('');
      setState('idle');
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.body.classList.remove('notes-on');
    };
  }, [mode]);

  const cancelMode = () => setMode({ kind: 'idle' });

  const save = async () => {
    if (!pick || !text.trim()) return;
    setState('busy');
    try {
      const r = await send('POST', '/api/notes', { ...pick, text });
      if (!r.ok) throw new Error(String(r.status));
      setState('saved');
      window.dispatchEvent(new Event('notes:changed'));
      setTimeout(() => {
        setPick(null);
        setMode({ kind: 'idle' });
      }, 900);
    } catch {
      setState('error');
    }
  };

  const saveEdit = async () => {
    if (!editing || !editing.text.trim()) return;
    const r = await send('PATCH', `/api/notes/${editing.id}`, { text: editing.text });
    if (r.ok) {
      setEditing(null);
      window.dispatchEvent(new Event('notes:changed'));
    }
  };

  const remove = async (n: Note) => {
    if (!window.confirm(`Notiz löschen?\n\n${n.text}`)) return;
    const r = await send('DELETE', `/api/notes/${n.id}`);
    if (r.ok || r.status === 404) window.dispatchEvent(new Event('notes:changed'));
  };

  const startAdd = () => {
    setPanel(false);
    setMode({ kind: 'add' });
  };
  const startPlace = (n: Note) => {
    setPanel(false);
    setMode({ kind: 'place', id: n.id });
  };

  return (
    <>
      {mode.kind !== 'idle' && !pick && (
        <div className="note-ui note-hint" role="status">
          <span>{mode.kind === 'add' ? 'Stelle antippen für eine Notiz' : `Neue Stelle für Notiz ${mode.id} antippen`}</span>
          <button type="button" onClick={cancelMode} aria-label="Modus beenden">
            <Close size={18} />
          </button>
        </div>
      )}
      {mode.kind === 'idle' && !panel && (
        <button type="button" className="note-ui note-fab" onClick={() => setPanel(true)}>
          Notizen{list.length ? ` · ${list.length}` : ''}
        </button>
      )}
      {panel && (
        <div className="note-ui note-sheet note-list" role="dialog" aria-label="Notizen">
          <header>
            <b>Notizen</b>
            <button type="button" onClick={() => setPanel(false)} aria-label="Schließen">
              <Close size={18} />
            </button>
          </header>
          <button type="button" className="note-save" onClick={startAdd}>
            Neue Notiz
          </button>
          {list.length === 0 && <p className="note-target">Keine offenen Notizen.</p>}
          <ul>
            {list.map((n) => (
              <li key={n.id}>
                <p className="note-text">
                  <b>{n.id}.</b> {n.text}
                </p>
                <p className="note-target">
                  {n.target || 'Allgemein'}
                  {n.anchor ? '' : ' · ohne Pfeil'}
                </p>
                {editing?.id === n.id ? (
                  <div className="note-edit">
                    <textarea value={editing.text} onChange={(e) => setEditing({ id: n.id, text: e.target.value })} rows={3} maxLength={1000} />
                    <div className="note-actions">
                      <button type="button" className="note-save" onClick={saveEdit} disabled={!editing.text.trim()}>
                        Speichern
                      </button>
                      <button type="button" onClick={() => setEditing(null)}>
                        Abbrechen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="note-actions">
                    <button type="button" onClick={() => setEditing({ id: n.id, text: n.text })}>
                      Bearbeiten
                    </button>
                    <button type="button" onClick={() => startPlace(n)}>
                      Stelle setzen
                    </button>
                    <button type="button" className="note-del" onClick={() => remove(n)}>
                      Löschen
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {pick && (
        <div className="note-ui note-sheet" role="dialog" aria-label="Notiz">
          <header>
            <b>Notiz</b>
            <button type="button" onClick={() => { setPick(null); setMode({ kind: 'idle' }); }} aria-label="Abbrechen">
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
    </>
  );
}
