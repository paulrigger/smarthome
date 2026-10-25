import { useEffect, useState } from 'react';
import { PALETTES, applyAppearance, loadAppearance, type Mode, type Palette } from '../themes';
import { OVERVIEW_STYLES, loadOverviewStyle, saveOverviewStyle, type OverviewStyle } from '../overviewStyle';
import { TariffEditor } from '../components/TariffEditor';
import { ThresholdEditor } from '../components/ThresholdEditor';
import { ICON_BGS, applyIconBg, iconInk, loadIconBg } from '../appIcon';

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

/** Skizze der Übersichts-Darstellung in der aktuellen Palette. */
function StyleSketch({ id }: { id: OverviewStyle }) {
  const st = { fill: 'none', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <span className="pal-preview style-preview" aria-hidden>
      <svg viewBox="0 0 60 36" width="60" height="36">
        {id === 'house' && (
          <>
            <path d="M8 18 L22 8 L36 18 V32 H8 Z" {...st} stroke="var(--structure)" />
            <circle cx="48" cy="10" r="4.5" {...st} stroke="var(--c-sun)" />
            <circle cx="48" cy="27" r="4.5" {...st} stroke="var(--c-battery)" />
            <path d="M43 27 H37" {...st} stroke="var(--flow-elec)" strokeDasharray="0.1 3" />
          </>
        )}
        {id === 'sankey' && (
          <>
            <path d="M6 4 C30 4 30 22 54 22 V32 C30 32 30 16 6 16 Z" fill="var(--c-sun)" fillOpacity="0.45" />
            <path d="M6 4 C30 4 30 4 54 4 V8 C30 8 30 8 6 8 Z" fill="var(--c-sun)" fillOpacity="0.8" />
            <path d="M6 20 C30 20 30 32 54 32" {...st} stroke="var(--c-grid)" strokeWidth="5" strokeLinecap="butt" strokeOpacity="0.6" />
            <rect x="3" y="3" width="3" height="30" rx="1" fill="var(--text)" />
            <rect x="54" y="3" width="3" height="30" rx="1" fill="var(--text)" />
          </>
        )}
        {id === 'hub' && (
          <>
            <path d="M30 18 L10 6 M30 18 L50 6 M30 18 L6 24 M30 18 L54 24 M30 18 L30 33" {...st} stroke="var(--flow-elec)" strokeOpacity="0.7" />
            <circle cx="30" cy="18" r="8" fill="var(--surface)" stroke="var(--text)" strokeWidth="1.6" />
            <circle cx="10" cy="6" r="3.5" fill="var(--surface)" stroke="var(--c-sun)" strokeWidth="1.4" />
            <circle cx="50" cy="6" r="3.5" fill="var(--surface)" stroke="var(--c-sun)" strokeWidth="1.4" />
            <circle cx="6" cy="24" r="3.5" fill="var(--surface)" stroke="var(--c-grid)" strokeWidth="1.4" />
            <circle cx="54" cy="24" r="3.5" fill="var(--surface)" stroke="var(--c-battery)" strokeWidth="1.4" />
            <circle cx="30" cy="33" r="2.5" fill="var(--surface)" stroke="var(--c-heat)" strokeWidth="1.4" />
          </>
        )}
        {id === 'model' && (
          <>
            <path d="M20 22 L30 15 L42 20 L42 28 L30 32 L20 28 Z M20 22 L32 26 L42 20 M32 26 V32" {...st} stroke="var(--structure)" strokeWidth="1.2" />
            <path d="M12 7 Q20 14 26 18 M48 7 Q44 14 38 18 M8 30 Q14 26 21 25 M30 34 Q30 32 30 31" {...st} stroke="var(--flow-elec)" strokeWidth="1" strokeDasharray="0.1 2.6" />
            <circle cx="10" cy="5" r="3.5" fill="var(--surface)" stroke="var(--c-sun)" strokeWidth="1.3" />
            <circle cx="50" cy="5" r="3.5" fill="var(--surface)" stroke="var(--c-battery)" strokeWidth="1.3" />
            <circle cx="6" cy="31" r="3.5" fill="var(--surface)" stroke="var(--c-grid)" strokeWidth="1.3" />
          </>
        )}
      </svg>
    </span>
  );
}

export function Settings() {
  const [{ palette, mode }, set] = useState(loadAppearance);
  const [dark, setDark] = useState(() => usesDark(mode));
  const [style, setStyle] = useState(loadOverviewStyle);
  const [iconBg, setIconBg] = useState(loadIconBg);
  const setIcon = (c: string) => {
    setIconBg(c);
    void applyIconBg(c);
  };

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
        <h2>Darstellung Übersicht</h2>
        <div className="pal-list" role="radiogroup" aria-label="Darstellung Übersicht">
          {OVERVIEW_STYLES.map((o) => (
            <button key={o.id} role="radio" aria-checked={style === o.id} className={`pal${style === o.id ? ' on' : ''}`} onClick={() => (setStyle(o.id), saveOverviewStyle(o.id))}>
              <StyleSketch id={o.id} />
              <span className="pal-text">
                <strong>{o.name}</strong>
                <span>{o.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>App-Symbol</h2>
        <div className="icon-bgs" role="radiogroup" aria-label="Hintergrundfarbe des App-Symbols">
          {ICON_BGS.map((b) => (
            <button key={b.id} role="radio" aria-checked={iconBg === b.color} className={`icon-bg${iconBg === b.color ? ' on' : ''}`} onClick={() => setIcon(b.color)}>
              <span className="icon-prev" style={{ background: b.color }}>
                <img src="icon-fg.png" alt="" style={{ filter: iconInk(b.color) === '#000000' ? 'invert(1)' : undefined }} />
              </span>
              {b.name}
            </button>
          ))}
          <label className={`icon-bg${ICON_BGS.some((b) => b.color === iconBg) ? '' : ' on'}`}>
            <span className="icon-prev" style={{ background: iconBg }}>
              <input type="color" value={iconBg} onChange={(e) => setIcon(e.target.value)} aria-label="Eigene Farbe" />
              <img src="icon-fg.png" alt="" style={{ filter: iconInk(iconBg) === '#000000' ? 'invert(1)' : undefined }} />
            </span>
            Eigene
          </label>
        </div>
        <p className="hint">Favicon und Symbol auf dem Home-Bildschirm. iOS übernimmt die Farbe beim nächsten „Zum Home-Bildschirm“ – dafür das Symbol einmal neu hinzufügen.</p>
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
        <TariffEditor />
      </section>

      <section>
        <h2>Geräte: aus / Standby / an</h2>
        <ThresholdEditor />
      </section>
    </div>
  );
}
