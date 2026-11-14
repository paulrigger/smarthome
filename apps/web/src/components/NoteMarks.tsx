import { useEffect, useRef, useState } from 'react';
import { api } from '../data';

/** Pfeilspitzen der offenen Notizen: zeigen auf die Stelle, die beim Notieren angetippt wurde (Anteil im markierten Element).
 *  Gezeichnet wird nur, wenn das Element gerade sichtbar ist. Die Position wird nur kurz nach Bewegungen nachgeführt (spart Akku). */
/** Notiz wie von GET /api/notes (Felder für die Pfeilspitze sind optional) */
interface Note {
  id: number;
  text: string;
  done: boolean;
  anchor: string | null;
  fx: number | null;
  fy: number | null;
}

interface Mark {
  id: number;
  text: string;
  anchor: string;
  fx: number;
  fy: number;
}

/** Element mit dem Schlüssel (data-note oder aria-label); bei mehreren das zuletzt geöffnete. */
function findAnchor(key: string): HTMLElement | null {
  const q = CSS.escape(key);
  const els = document.querySelectorAll<HTMLElement>(`[data-note="${q}"],[aria-label="${q}"]`);
  return els.length ? els[els.length - 1] : null;
}

const KEEP_MS = 900; // nach einer Bewegung so lange nachführen

export function NoteMarks() {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [, tick] = useState(0);
  const until = useRef(0);
  const raf = useRef(0);

  useEffect(() => {
    const load = () =>
      api('/api/notes')
        .then((r) => (r.ok ? (r.json() as Promise<Note[]>) : []))
        .then((list) =>
          setMarks(
            list
              .filter((n): n is Note & { anchor: string; fx: number; fy: number } => !!n.anchor && n.fx != null && n.fy != null)
              .map((n) => ({ id: n.id, text: n.text, anchor: n.anchor, fx: n.fx, fy: n.fy })),
          ),
        )
        .catch(() => undefined);
    load();
    window.addEventListener('notes:changed', load);
    return () => window.removeEventListener('notes:changed', load);
  }, []);

  // Nachführen: nach Scrollen, Größenänderung, Übergängen und Animationen (z. B. Explosion) kurz neu zeichnen
  useEffect(() => {
    const frame = () => {
      tick((n) => n + 1);
      raf.current = performance.now() < until.current ? requestAnimationFrame(frame) : 0;
    };
    const kick = () => {
      until.current = performance.now() + KEEP_MS;
      if (!raf.current) raf.current = requestAnimationFrame(frame);
    };
    const events = ['scroll', 'resize', 'transitionend', 'animationend', 'pointerup', 'notes:changed'] as const;
    for (const ev of events) window.addEventListener(ev, kick, { capture: true, passive: true });
    kick();
    return () => {
      for (const ev of events) window.removeEventListener(ev, kick, { capture: true });
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [marks]);

  return (
    <div className="note-marks" aria-hidden>
      {marks.map((m, i) => {
        const el = findAnchor(m.anchor);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        return (
          <div key={m.id} className="note-mark" style={{ left: r.left + m.fx * r.width, top: r.top + m.fy * r.height }}>
            <svg viewBox="0 0 40 40">
              <line x1="4" y1="4" x2="30" y2="30" className="nm-shadow" />
              <line x1="4" y1="4" x2="30" y2="30" className="nm-line" />
              <polygon points="34,34 22,33 33,22" className="nm-head" />
            </svg>
            <span>
              {i + 1}. {m.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}
