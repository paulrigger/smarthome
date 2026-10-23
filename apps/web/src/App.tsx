import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { HashRouter, MemoryRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Period } from '@smarthome/shared';
import { Car, Chart, ChevronLeft, ChevronRight, Euro, Flame, Gear, Home } from './components/Icons';
import { MOCK, useLive } from './data';
import { clock } from './format';
import { Overview } from './pages/Overview';
import { Heat } from './pages/Heat';
import { Economics } from './pages/Economics';
import { Car as CarPage } from './pages/Car';
import { Soon } from './pages/Soon';
import { Settings } from './pages/Settings';
import { canNext, makeView, rangeText, step, today, type View } from './view';

// Vorschau (Artifact) ohne URL-Hash-Routing
const Router = MOCK ? MemoryRouter : HashRouter;

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// Neue Module: hier eintragen + Route unten. Navigation passt sich an.
const NAV: { to: string; label: string; Icon: Icon }[] = [
  { to: '/', label: 'Übersicht', Icon: Home },
  { to: '/kosten', label: 'Kosten', Icon: Euro },
  { to: '/waerme', label: 'Wärme', Icon: Flame },
  { to: '/auto', label: 'Auto', Icon: Car },
  { to: '/verlauf', label: 'Verlauf', Icon: Chart },
  { to: '/einstellungen', label: 'Einstellungen', Icon: Gear },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: 'day', label: 'Tag' },
  { id: 'month', label: 'Monat' },
  { id: 'year', label: 'Jahr' },
];

function loadPeriod(): Period {
  try {
    const p = localStorage.getItem('period');
    return p === 'month' || p === 'year' ? p : 'day';
  } catch {
    return 'day';
  }
}

/** Zeitraum-Leiste nur dort, wo sie etwas bewirkt (nicht in den Einstellungen). */
function RangeBar({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return pathname.startsWith('/einstellungen') ? null : <>{children}</>;
}

export function App() {
  const [view, setView] = useState<View>(() => makeView(loadPeriod(), today()));
  const { data: live, conn } = useLive();
  const range = rangeText(view);

  useEffect(() => {
    try {
      localStorage.setItem('period', view.period);
    } catch {
      /* privat-Modus */
    }
  }, [view.period]);

  // Mitternacht/Monatswechsel: laufende Ansicht bleibt "aktuell"
  useEffect(() => {
    const t = setInterval(() => setView((v) => (v.isCurrent ? makeView(v.period, today()) : v)), 60_000);
    return () => clearInterval(t);
  }, []);

  const setPeriod = (p: Period) => setView((v) => makeView(p, v.isCurrent ? today() : v.date));

  return (
    <Router>
      <div className="shell">
        <nav className="nav" aria-label="Bereiche">
          <div className="brand">Haus</div>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${to === '/einstellungen' ? ' nav-settings' : ''}`}>
              <Icon size={24} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <header className="top">
          <div className="top-row">
            <div className="seg" role="tablist" aria-label="Zeitraum">
              {PERIODS.map((p) => (
                <button key={p.id} role="tab" aria-selected={view.period === p.id} className={view.period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className={`conn ${conn}`} title={conn === 'live' ? 'Live-Verbindung aktiv' : conn === 'offline' ? 'Keine Verbindung zum Server' : 'Verbinde …'}>
              <i />
              {conn === 'offline' ? 'Offline' : clock(live?.ts)}
              {MOCK && <em>Demo-Daten</em>}
            </div>
          </div>
          <RangeBar>
          <div className="range">
            <button className="nav-btn" onClick={() => setView((v) => step(v, -1))} aria-label="Zurück">
              <ChevronLeft size={22} />
            </button>
            <div className="range-text" aria-live="polite">
              <strong>{range.title}</strong>
              <span>{range.span}</span>
            </div>
            <button className="nav-btn" onClick={() => setView((v) => step(v, 1))} disabled={!canNext(view)} aria-label="Weiter">
              <ChevronRight size={22} />
            </button>
            {!view.isCurrent && (
              <button className="now-btn" onClick={() => setView((v) => makeView(v.period, today()))}>
                {view.period === 'day' ? 'Heute' : view.period === 'month' ? 'Dieser Monat' : 'Dieses Jahr'}
              </button>
            )}
          </div>
          </RangeBar>
        </header>

        <main className="main">
          <Routes>
            <Route path="/" element={<Overview view={view} live={live} conn={conn} />} />
            <Route path="/kosten" element={<Economics view={view} />} />
            <Route path="/waerme" element={<Heat view={view} />} />
            <Route path="/auto" element={<CarPage view={view} />} />
            <Route path="/einstellungen" element={<Settings />} />
            <Route path="/verlauf" element={<Soon title="Verlauf" text="Leistungs- und Energiekurven über Tag, Monat und Jahr." />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
