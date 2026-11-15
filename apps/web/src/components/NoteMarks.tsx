import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { api } from '../data';

/** Pfeilspitzen der offenen Notizen. Im Notiz-Modus (live) wackeln sie: ziehen = verschieben, antippen = bearbeiten, × = löschen. */
export interface ArrowNote {
  id: number;
  text: string;
  anchor: string;
  fx: number;
  fy: number;
}

interface Props {
  notes: ArrowNote[];
  live: boolean;
  onTap: (n: ArrowNote) => void;
  onDelete: (n: ArrowNote) => void;
  onMoved: () => void;
}

const KEEP_MS = 900; // nach einer Bewegung so lange nachführen
const TAP_PX = 6; // weniger Weg = Antippen, nicht Ziehen

/** Element mit dem Schlüssel (data-note oder aria-label); bei mehreren das zuletzt geöffnete. */
function findAnchor(key: string): HTMLElement | null {
  const q = CSS.escape(key);
  const els = document.querySelectorAll<HTMLElement>(`[data-note="${q}"],[aria-label="${q}"]`);
  return els.length ? els[els.length - 1] : null;
}

/** Ziehen einer Pfeilspitze: Abstand zum Zeiger beim Anfassen merken, damit sie nicht springt. */
interface Drag {
  note: ArrowNote;
  el: HTMLElement;
  dx: number;
  dy: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  moved: boolean;
}

export function NoteArrows({ notes, live, onTap, onDelete, onMoved }: Props) {
  const [, tick] = useState(0);
  const [moving, setMoving] = useState<{ id: number; x: number; y: number } | null>(null);
  const until = useRef(0);
  const raf = useRef(0);
  const drag = useRef<Drag | null>(null);
  const justDragged = useRef(false); // nach einem Ziehen kommt noch ein Klick, der nicht zählt

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
  }, [notes]);

  const down = (n: ArrowNote, e: PointerEvent<SVGSVGElement>) => {
    if (!live) return;
    const el = findAnchor(n.anchor);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const tipX = r.left + n.fx * r.width, tipY = r.top + n.fy * r.height;
    drag.current = { note: n, el, dx: e.clientX - tipX, dy: e.clientY - tipY, x: tipX, y: tipY, sx: e.clientX, sy: e.clientY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_PX) d.moved = true;
    if (!d.moved) return;
    d.x = e.clientX - d.dx;
    d.y = e.clientY - d.dy;
    setMoving({ id: d.note.id, x: d.x, y: d.y });
  };
  // Ende des Ziehens: nur speichern, wenn wirklich verschoben wurde. Antippen kommt über onClick.
  const up = () => {
    const d = drag.current;
    drag.current = null;
    setMoving(null);
    justDragged.current = !!d?.moved;
    if (!d || !d.moved) return;
    const r = d.el.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    const fx = clamp((d.x - r.left) / r.width), fy = clamp((d.y - r.top) / r.height);
    void api(`/api/notes/${d.note.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fx, fy }) })
      .then(() => onMoved())
      .catch(() => undefined);
  };

  return (
    <div className={`note-marks note-ui${live ? ' live' : ''}`} aria-hidden={!live}>
      {notes.map((n, i) => {
        const el = findAnchor(n.anchor);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return null;
        const at = moving?.id === n.id ? moving : { x: r.left + n.fx * r.width, y: r.top + n.fy * r.height };
        return (
          <div key={n.id} className="note-mark" style={{ left: at.x, top: at.y, animationDelay: `${-((n.id * 37) % 10) / 10}s` }}>
            <svg
              viewBox="0 0 40 40"
              onPointerDown={(e) => down(n, e)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={() => { drag.current = null; setMoving(null); }}
              onClick={() => {
                if (justDragged.current) return (justDragged.current = false);
                if (live) onTap(n);
              }}
            >
              <line x1="4" y1="4" x2="30" y2="30" className="nm-shadow" />
              <line x1="4" y1="4" x2="30" y2="30" className="nm-line" />
              <polygon points="34,34 22,33 33,22" className="nm-head" />
            </svg>
            <span>
              {i + 1}. {n.text}
            </span>
            <button type="button" className="nm-x" aria-label="Notiz löschen" onClick={() => onDelete(n)}>
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
