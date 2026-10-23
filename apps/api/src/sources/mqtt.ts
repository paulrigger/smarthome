import mqtt from 'mqtt';
import type { RawPoints } from '../domain/energy';
import { MqttLiveState, mqttTopics } from '../domain/mqttLive';

export interface MqttConfig {
  host: string;
  port: number;
  username?: string;
  password?: string;
  /** z.B. "saic/<konto>/vehicles/<VIN>" – ohne: Auto-Werte aus Influx */
  carPrefix?: string;
}

export interface LiveFeed {
  points(): RawPoints;
  status(): { connected: boolean; lastMessage: string | null };
}

/** Abonniert die Live-Topics (nur lesen) und hält den letzten Wert je Key. Reconnect automatisch. */
export function mqttFeed(cfg: MqttConfig, log: (msg: string) => void = () => {}): LiveFeed {
  const state = new MqttLiveState(cfg.carPrefix);
  const client = mqtt.connect({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
    clientId: `smarthome-app-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
  });
  client.on('connect', () => {
    client.subscribe(mqttTopics(cfg.carPrefix), { qos: 0 }, (err) => log(err ? `mqtt subscribe failed: ${err.message}` : 'mqtt subscribed'));
  });
  client.on('message', (topic, buf) => state.apply(topic, buf.toString('utf8')));
  client.on('error', (err) => log(`mqtt error: ${err.message}`));

  return {
    points: () => state.points(),
    status: () => ({ connected: client.connected, lastMessage: state.lastMessage?.toISOString() ?? null }),
  };
}
