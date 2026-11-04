import { statusProblems, type DeviceStatus, type Level, type SourceStatus } from '@smarthome/shared';
import { useStatus } from '../data';
import { SubHead } from './SettingsNav';

// Einstellungen → System → Status: letzter Wert je Gerät über MQTT (live) und InfluxDB (gespeichert), mit Ampel.

const LABEL: Record<Level, string> = { ok: 'OK', late: 'verzögert', down: 'keine Daten' };
const RANK: Record<Level, number> = { ok: 0, late: 1, down: 2 };

export function formatAge(s: number): string {
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} h`;
  return `vor ${Math.round(s / 86400)} d`;
}

const when = (iso: string) => new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const worst = (d: DeviceStatus) => Math.max(RANK[d.influx.level], d.mqtt ? RANK[d.mqtt.level] : 0);

function Lamp({ level }: { level: Level }) {
  return <span className={`lamp ${level}`} aria-hidden />;
}

function Cell({ title, src }: { title: string; src: SourceStatus | null }) {
  if (!src) {
    return (
      <div className="st-cell">
        <span className="st-src">{title}</span>
        <span className="st-none">nicht über MQTT</span>
      </div>
    );
  }
  return (
    <div className={`st-cell ${src.level}`}>
      <span className="st-src">{title}</span>
      <span className="st-main">
        <Lamp level={src.level} />
        {LABEL[src.level]}
      </span>
      <span className="st-when">
        {src.seen ? when(src.seen) : '–'}
        {src.ageS !== null && <> · {formatAge(src.ageS)}</>}
      </span>
    </div>
  );
}

export function StatusPage() {
  const st = useStatus();
  if (!st) {
    return (
      <div className="settings">
        <SubHead title="Status" />
        <p className="hint">Lade Status …</p>
      </div>
    );
  }
  const devices = [...st.devices].sort((a, b) => worst(b) - worst(a) || a.name.localeCompare(b.name, 'de'));
  const problems = statusProblems(st).length;
  const mqttAge = st.mqtt.lastMessage ? Math.max(0, Math.round((Date.parse(st.ts) - Date.parse(st.mqtt.lastMessage)) / 1000)) : null;

  return (
    <div className="settings status-page">
      <SubHead title="Status" />

      <div className="st-top">
        <div className="st-sys">
          <Lamp level={st.mqtt.connected ? 'ok' : 'down'} />
          <span className="st-sys-title">MQTT</span>
          <small>{st.mqtt.connected ? (mqttAge !== null ? `letzte Nachricht ${formatAge(mqttAge)}` : 'verbunden') : 'getrennt'}</small>
        </div>
        <div className="st-sys">
          <Lamp level={st.influx.ok ? 'ok' : 'down'} />
          <span className="st-sys-title">InfluxDB</span>
          <small>{st.influx.ok ? 'erreichbar' : 'nicht erreichbar'}</small>
        </div>
        <div className="st-sys">
          <Lamp level={problems ? 'late' : 'ok'} />
          <span className="st-sys-title">Geräte</span>
          <small>{problems ? `${problems} mit Störung` : 'alle OK'}</small>
        </div>
      </div>

      <div className="st-list">
        <div className="st-head" aria-hidden>
          <span>Gerät</span>
          <span>MQTT (live)</span>
          <span>InfluxDB (gespeichert)</span>
        </div>
        {devices.map((d) => (
          <div key={d.id} className="st-row">
            <span className="st-name">
              {d.name}
              <small>Takt {d.maxAgeMin} min</small>
            </span>
            <Cell title="MQTT" src={d.mqtt} />
            <Cell title="Influx" src={d.influx} />
          </div>
        ))}
      </div>

      <p className="hint">
        Ampel: grün = innerhalb des Takts, gelb = bis 3× Takt überfällig, rot = länger oder nie gesehen. Stand {when(st.ts)}.
      </p>
    </div>
  );
}
