import { useEffect, useState } from 'react';
import { api } from '../data';
import { Close } from './Icons';

/** Notiz-Modus: Button unten rechts an, danach jede Stelle antippen → Notiz dazu. Die Notiz landet mit Seite und Bereich in der App-DB (GET /api/notes). */
interface Pick {
  target: string;
  route: string;
}

/** Bereich der Stelle: data-note, sonst aria-label/Überschrift/Zeile, Text gekürzt. */
function labelOf(el: Element): string {
  const named = el.closest<HTMLElement>('[data-note],[aria-label],section,li,button');
  const raw = named?.dataset.note ?? named?.getAttribute('aria-label') ?? named?.textContent ?? '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function NoteMode() {
  const [on, setOn] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'error' | 'saved'>('idle');

  useEffect(() => {
    if (!on) return;
    document.body.classList.add('notes-on');
    // Capture: die Stelle wird nicht bedient, sondern nur markiert. Eigene Notiz-Elemente bleiben bedienbar.
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || el.closest('.note-ui')) return;
      e.preventDefault();
      e.stopPropagation();
      setPick({ target: labelOf(el), route: location.hash });
      setText('');
      setState('idle');
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.body.classList.remove('notes-on');
    };
  }, [on]);

  const close = () => {
    setPick(null);
    setOn(false);
  };

  const save = async () => {
    if (!pick || !text.trim()) return;
    setState('busy');
    try {
      const r = await api('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...pick, text }) });
      if (!r.ok) throw new Error(String(r.status));
      setState('saved');
      setTimeout(close, 900);
    } catch {
      setState('error');
    }
  };

  return (
    <>
      {on && !pick && (
        <div className="note-ui note-hint" role="status">
          <span>Stelle antippen für eine Notiz</span>
          <button type="button" onClick={close} aria-label="Notiz-Modus beenden">
            <Close size={18} />
          </button>
        </div>
      )}
      {!on && (
        <button type="button" className="note-ui note-fab" onClick={() => setOn(true)}>
          Notiz
        </button>
      )}
      {pick && (
        <div className="note-ui note-sheet" role="dialog" aria-label="Notiz">
          <header>
            <b>Notiz</b>
            <button type="button" onClick={close} aria-label="Abbrechen">
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
