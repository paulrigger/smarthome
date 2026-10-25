import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { HashRouter, MemoryRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Period } from '@smarthome/shared';
import { Car, Chart, ChevronLeft, ChevronRight, Euro, Flame, Gear, Home } from './components/Icons';
import { MOCK, useLive } from './data';
import { Overview } from './pages/Overview';
import { Heat } from './pages/Heat';
import { Economics } from './pages/Economics';
import { Car as CarPage } from './pages/Car';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Login, useAuth } from './components/Login';
import { canNext, makeView, rangeText, shortLabel, step, today, type View } from './view';

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
  const auth = useAuth();
  if (auth === 'login') return <Login />;
  if (auth === 'checking') return null;
  return <Main />;
}

function Main() {
  const [view, setView] = useState<View>(() => makeView(loadPeriod(), today()));
  const { data: live, conn } = useLive();
  const range = rangeText(view);
  const s = shortLabel(view);
  const short = s.charAt(0).toUpperCase() + s.slice(1);
  const nowLabel = view.period === 'day' ? 'Heute' : view.period === 'month' ? 'Dieser Monat' : 'Dieses Jahr';

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
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}${to === '/einstellungen' ? ' nav-settings' : ''}`}>
              <Icon size={24} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Kopfzeile bleibt beim Scrollen stehen: Zeitraum + vor/zurück in einer Zeile; Live-Stand steht über der Grafik (Overview) */}
        <header className="top">
          <div className="seg" role="tablist" aria-label="Zeitraum">
            {PERIODS.map((p) => (
              <button key={p.id} role="tab" aria-selected={view.period === p.id} className={view.period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <RangeBar>
            <div className="range">
              <button className="nav-btn" onClick={() => setView((v) => step(v, -1))} aria-label="Zurück">
                <ChevronLeft size={22} />
              </button>
              {/* Handy: Kurzform; nicht aktueller Zeitraum → Antippen springt zurück auf jetzt */}
              <button className="range-text" aria-live="polite" disabled={view.isCurrent} onClick={() => setView((v) => makeView(v.period, today()))} aria-label={view.isCurrent ? range.title : `${range.title} – zurück zu ${nowLabel}`}>
                <strong className="rt-long">{range.title}</strong>
                <strong className="rt-short">{short}</strong>
                <span className="rt-long">{range.span}</span>
                {!view.isCurrent && <span className="rt-short rt-now">↺ {view.period === 'day' ? 'heute' : 'jetzt'}</span>}
              </button>
              <button className="nav-btn" onClick={() => setView((v) => step(v, 1))} disabled={!canNext(view)} aria-label="Weiter">
                <ChevronRight size={22} />
              </button>
              {!view.isCurrent && (
                <button className="now-btn" onClick={() => setView((v) => makeView(v.period, today()))}>
                  {nowLabel}
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
            <Route path="/einstellungen/*" element={<Settings />} />
            <Route path="/verlauf" element={<History view={view} />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
