import type { LiveSnapshot } from '@smarthome/shared';
import { MOCK, type Conn } from '../data';
import { clock } from '../format';

/** Stand der Live-Daten mit Verbindungspunkt (über der Grafik der Übersicht, scrollt mit). */
export function ConnBadge({ conn, live }: { conn: Conn; live: LiveSnapshot | null }) {
  return (
    <div className={`conn ${conn}`} title={conn === 'live' ? 'Live-Verbindung aktiv' : conn === 'offline' ? 'Keine Verbindung zum Server' : 'Verbinde …'}>
      <i />
      {conn === 'offline' ? 'Offline' : clock(live?.ts)}
      {MOCK && <em>Demo-Daten</em>}
    </div>
  );
}
