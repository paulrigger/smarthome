import type { ForecastResponse } from '@smarthome/shared';
import { num } from '../format';

/** Kleines Feld: Lade-Empfehlung fürs Auto + PV/Überschuss der nächsten Tage (Prognose Open-Meteo, kalibriert auf die eigene PV). */
const fDay = new Intl.DateTimeFormat('de-AT', { weekday: 'short', timeZone: 'UTC' });
const kwh = (v: number) => num(v, v < 10 ? 1 : 0, 'kWh');

export function ForecastCard({ data }: { data: ForecastResponse | null }) {
  if (!data) return null;
  if (!data.configured) return null; // ohne Standort keine Kachel (Hinweis steht unter Einstellungen → Status)
  const { advice, days, car } = data;
  const need = car.needKwh ?? 0;
  // Reserve über dem Bedarf, sonst liegt die Bedarfslinie am Balkenrand und wird abgeschnitten (overflow: hidden)
  const max = Math.max(1, need * 1.15, ...days.map((d) => d.surplusKwh));
  const label = (date: string, i: number) => (i === 0 ? 'Heute' : i === 1 ? 'Morgen' : fDay.format(new Date(`${date}T12:00:00Z`)));
  return (
    <section className={`forecast ${advice.kind}`} aria-label="PV-Prognose und Lade-Empfehlung">
      <header>
        <b>{advice.title}</b>
        <span>{advice.detail}</span>
      </header>
      {car.soc != null && (
        <p className="fc-car">
          Auto {num(car.soc, 0, '%')} → {num(car.targetSoc, 0, '%')}
          {car.needKwh ? <> · fehlt {kwh(car.needKwh)}</> : null}
        </p>
      )}
      <ul>
        {days.map((d, i) => (
          <li key={d.date} className={advice.byDate === d.date ? 'hit' : ''}>
            <span className="fc-day">{label(d.date, i)}{d.partial ? <small> ab jetzt</small> : null}</span>
            <span className="fc-bar" aria-hidden>
              <i style={{ height: `${Math.round((d.surplusKwh / max) * 100)}%` }} />
              {need > 0 && <em style={{ bottom: `${Math.min(100, Math.round((need / max) * 100))}%` }} />}
            </span>
            <span className="fc-val">{kwh(d.surplusKwh)}</span>
            <span className="fc-pv">PV {kwh(d.pvKwh)}</span>
            <span className="fc-load">
              Haus {kwh(d.loadKwh)}
              <small>WP {kwh(d.heatpumpKwh)}{d.tempC !== null ? ` · ${num(d.tempC, 0, '°C')}` : ''}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="fc-note">
        Überschuss = PV-Prognose − Hausverbrauch − Akku nachladen. Hausverbrauch = Grundlast + Wärmepumpe
        {data.model.heatDays > 0
          ? ` (WP nach Heizgradtagen aus der Temperaturprognose, ${num(data.model.heatPerHddKwh, 2, 'kWh')} je HGT, ${data.model.heatDays} Tage Fit).`
          : ' (WP im Mittel, zu wenig Tage für den Temperaturfit).'}
      </p>
    </section>
  );
}
