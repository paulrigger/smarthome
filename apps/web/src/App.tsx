import { useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import type { Period } from '@smarthome/shared';
import { Car, Chart, Euro, Flame, Home } from './components/Icons';
import { MOCK, useLive } from './data';
import { clock } from './format';
import { Overview } from './pages/Overview';
import { Soon } from './pages/Soon';

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

// Neue Module: hier eintragen + Route unten. Navigation passt sich an.
const NAV: { to: string; label: string; Icon: Icon }[] = [
  { to: '/', label: 'Übersicht', Icon: Home },
  { to: '/kosten', label: 'Kosten', Icon: Euro },
  { to: '/waerme', label: 'Wärme', Icon: Flame },
  { to: '/auto', label: 'Auto', Icon: Car },
  { to: '/verlauf', label: 'Verlauf', Icon: Chart },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Heute' },
  { id: 'month', label: 'Monat' },
];

function loadPeriod(): Period {
  try {
    const p = localStorage.getItem('period');
    return p === 'month' ? 'month' : 'today';
  } catch {
    return 'today';
  }
}

export function App() {
  const [period, setPeriod] = useState<Period>(loadPeriod);
  const { data: live, conn } = useLive();

  useEffect(() => {
    try {
      localStorage.setItem('period', period);
    } catch {
      /* privat-Modus */
    }
  }, [period]);

  return (
    <HashRouter>
      <div className="shell">
        <nav className="nav" aria-label="Bereiche">
          <div className="brand">Haus</div>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
              <Icon size={24} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <header className="top">
          <div className="seg" role="tablist" aria-label="Zeitraum">
            {PERIODS.map((p) => (
              <button key={p.id} role="tab" aria-selected={period === p.id} className={period === p.id ? 'on' : ''} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className={`conn ${conn}`} title={conn === 'live' ? 'Live-Verbindung aktiv' : conn === 'offline' ? 'Keine Verbindung zum Server' : 'Verbinde …'}>
            <i />
            {conn === 'offline' ? 'Offline' : clock(live?.ts)}
            {MOCK && <em>Demo-Daten</em>}
          </div>
        </header>

        <main className="main">
          <Routes>
            <Route path="/" element={<Overview period={period} live={live} conn={conn} />} />
            <Route path="/kosten" element={<Soon title="Kosten & Erlöse" text="Stromkosten, Einspeiseerlöse und Ersparnis durch PV – auf Basis deiner Tarife aus Node-RED." />} />
            <Route path="/waerme" element={<Soon title="Wärme" text="Wärmepumpe im Detail: Strom aus PV oder Netz, Arbeitszahl, Kosten pro kWh Wärme, Solarthermie." />} />
            <Route path="/auto" element={<Soon title="Auto" text="Ladungen, PV-Anteil und Kosten pro 100 km." />} />
            <Route path="/verlauf" element={<Soon title="Verlauf" text="Leistungs- und Energiekurven über Tag, Monat und Jahr." />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
