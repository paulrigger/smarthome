import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from './Icons';

/** Kopf einer Einstellungs-Unterseite mit Zurück-Link (eine Ebene höher). */
export function SubHead({ title, back = '..', backLabel = 'Einstellungen' }: { title: string; back?: string; backLabel?: string }) {
  return (
    <header className="sub-head">
      <Link to={back} relative="path" className="sub-back">
        <ChevronLeft size={20} />
        {backLabel}
      </Link>
      <h1>{title}</h1>
    </header>
  );
}

/** Zeile einer Einstellungsliste: Titel, aktueller Wert, Pfeil. */
export function NavRow({ to, title, value, warn }: { to: string; title: string; value?: ReactNode; warn?: boolean }) {
  return (
    <Link to={to} className="nav-row">
      <span className="nr-title">{title}</span>
      <span className={`nr-value${warn ? ' warn' : ''}`}>{value}</span>
      <ChevronRight size={18} />
    </Link>
  );
}
