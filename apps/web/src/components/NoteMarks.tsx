import { useEffect, useRef, useState, type PointerEvent } from 'react';
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

/** Ziehen einer Pfeilspitze: Abstand zum Zeiger beim Anfassen merken, damit sie nicht springt. */
interface Drag {
  id: number;
  el: HTMLElement;
  dx: number;
  dy: number;
  x: number;
  y: number;
}

export function NoteMarks() {
  const [marks, setMarks] = useState<Mark[]>([]);
  const [, tick] = useState(0);
  const until = useRef(0);
  const raf = useRef(0);
  const drag = useRef<Drag | null>(null);
  const [moving, setMoving] = useState<{ id: number; x: number; y: number } | null>(null);

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

  const down = (m: Mark, e: PointerEvent<SVGSVGElement>) => {
    const el = findAnchor(m.anchor);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tipX = r.left + m.fx * r.width, tipY = r.top + m.fy * r.height;
    drag.current = { id: m.id, el, dx: e.clientX - tipX, dy: e.clientY - tipY, x: tipX, y: tipY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setMoving({ id: m.id, x: tipX, y: tipY });
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    d.x = e.clientX - d.dx;
    d.y = e.clientY - d.dy;
    setMoving({ id: d.id, x: d.x, y: d.y });
  };
  const drop = () => {
    const d = drag.current;
    drag.current = null;
    setMoving(null);
    if (!d) return;
    const r = d.el.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const fx = clamp((d.x - r.left) / r.width), fy = clamp((d.y - r.top) / r.height);
    void api(`/api/notes/${d.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fx, fy }) })
      .then(() => window.dispatchEvent(new Event('notes:changed')))
      .catch(() => undefined);
  };

  return (
    <div className="note-marks" aria-hidden>
      {marks.map((m, i) => {
        const el = findAnchor(m.anchor);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        const at = moving?.id === m.id ? moving : { x: r.left + m.fx * r.width, y: r.top + m.fy * r.height };
        return (
          <div key={m.id} className="note-mark" style={{ left: at.x, top: at.y }}>
            <svg viewBox="0 0 40 40" onPointerDown={(e) => down(m, e)} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}>
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
