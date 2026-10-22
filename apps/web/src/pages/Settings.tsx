import { useEffect, useState } from 'react';
import { PALETTES, applyAppearance, loadAppearance, type Mode, type Palette } from '../themes';

const MODES: { id: Mode; label: string }[] = [
  { id: 'system', label: 'Automatisch' },
  { id: 'light', label: 'Hell' },
  { id: 'dark', label: 'Dunkel' },
];

const SWATCH_KEYS = ['c-sun', 'c-grid', 'c-battery', 'c-heat', 'c-car', 'flow-heat'] as const;

function usesDark(mode: Mode) {
  return mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}

function Preview({ p, dark }: { p: Palette; dark: boolean }) {
  const t = dark ? p.dark : p.light;
  return (
    <span className="pal-preview" style={{ background: t.bg, borderColor: t.line }} aria-hidden>
      <svg viewBox="0 0 60 36" width="60" height="36">
        <path d="M8 18 L22 8 L36 18 V32 H8 Z" fill={t.surface} stroke={t.structure} strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="48" cy="12" r="5" fill="none" stroke={t['c-sun']} strokeWidth="1.6" />
        <path d="M43 12 H38" stroke={t['flow-elec']} strokeWidth="1.6" strokeDasharray="0.1 3" strokeLinecap="round" />
        <circle cx="48" cy="27" r="5" fill="none" stroke={t['c-heat']} strokeWidth="1.6" />
      </svg>
      <span className="pal-dots">
        {SWATCH_KEYS.map((k) => (
          <i key={k} style={{ background: t[k] }} />
        ))}
      </span>
    </span>
  );
}

export function Settings() {
  const [{ palette, mode }, set] = useState(loadAppearance);
  const [dark, setDark] = useState(() => usesDark(mode));

  useEffect(() => {
    applyAppearance(palette, mode);
    setDark(usesDark(mode));
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => setDark(usesDark(mode));
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [palette, mode]);

  return (
    <div className="settings">
      <h1>Einstellungen</h1>

      <section>
        <h2>Farbpalette</h2>
        <div className="pal-list" role="radiogroup" aria-label="Farbpalette">
          {PALETTES.map((p) => (
            <button key={p.id} role="radio" aria-checked={palette === p.id} className={`pal${palette === p.id ? ' on' : ''}`} onClick={() => set((s) => ({ ...s, palette: p.id }))}>
              <Preview p={p} dark={dark} />
              <span className="pal-text">
                <strong>{p.name}</strong>
                <span>{p.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>Hell / Dunkel</h2>
        <div className="seg" role="radiogroup" aria-label="Hell oder dunkel">
          {MODES.map((m) => (
            <button key={m.id} role="radio" aria-checked={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => set((s) => ({ ...s, mode: m.id }))}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="hint">Gilt nur für dieses Gerät – so kann der Wandbildschirm anders aussehen als das Handy.</p>
      </section>

      <section>
        <h2>Tarife</h2>
        <p className="hint">Strompreise, Zeitzonen (SNAP/WiNAP) und Einspeisetarif – kommt als Nächstes.</p>
      </section>
    </div>
  );
}
