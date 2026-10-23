import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Health, Period, SeriesKind, Tariff } from '@smarthome/shared';
import { DERIVED_ENERGY_KEYS, DERIVED_GAUGE_KEYS, SEED_TARIFFS, isDate, localDate, validateTariffs } from '@smarthome/shared';
import { openTariffStore } from './sources/tariffStore';
import { COUNTER_SERIES, LIVE_SERIES } from './domain/registry';
import { InfluxSource } from './sources/influx';
import { mqttFeed } from './sources/mqtt';
import { influxService, mockService, type DataService } from './service';
import { authConfig, registerAuth } from './auth';

const VERSION = process.env.APP_VERSION ?? 'dev';
const PORT = Number(process.env.PORT ?? 8090);
const TZ = process.env.APP_TZ ?? 'Europe/Vienna';
const LIVE_INTERVAL_MS = Number(process.env.LIVE_INTERVAL_MS ?? 5000);

const useMock = process.env.MOCK === '1' || !process.env.INFLUX_TOKEN;
const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });

// Live-Werte per MQTT (nur lesen); MQTT=0 schaltet ab -> Live wieder rein aus Influx
const feed =
  !useMock && process.env.MQTT !== '0' && process.env.MQTT_HOST
    ? mqttFeed(
        {
          host: process.env.MQTT_HOST,
          port: Number(process.env.MQTT_PORT ?? 1883),
          username: process.env.MQTT_USERNAME || undefined,
          password: process.env.MQTT_PASSWORD || undefined,
          carPrefix: process.env.MQTT_CAR_PREFIX || undefined,
        },
        (msg) => app.log.info(msg),
      )
    : undefined;

const svc: DataService = useMock
  ? mockService()
  : influxService(
      new InfluxSource({
        url: process.env.INFLUX_URL ?? 'http://10.0.0.1:8086',
        token: process.env.INFLUX_TOKEN!,
        org: process.env.INFLUX_ORG ?? 'paul',
        bucket: process.env.INFLUX_BUCKET ?? 'smarthome',
      }),
      TZ,
      feed,
    );

// Tarife: eigene Daten der App (SQLite), getrennt von InfluxDB
const tariffs = openTariffStore(process.env.DB_FILE ?? resolve(process.env.DATA_DIR ?? 'data', 'smarthome.db'), SEED_TARIFFS);

const auth = authConfig();
registerAuth(app, auth);

app.get('/api/health', async (): Promise<Health> => {
  const influx = await svc.ping();
  return { ok: influx.ok, version: VERSION, source: svc.source, influx, ...(feed && { mqtt: feed.status() }) };
});

app.get('/api/live', () => svc.live());

const PERIODS = new Set<Period>(['day', 'month', 'year']);
const ENERGY_KEYS = new Set<string>([...COUNTER_SERIES.map((d) => d.key), ...DERIVED_ENERGY_KEYS]);
const GAUGE_KEYS = new Set<string>([...LIVE_SERIES.map((d) => d.key), ...DERIVED_GAUGE_KEYS]);

function parseRange(q: { period?: string; date?: string }): { period: Period; date: string } | string {
  const period = (q.period === 'today' ? 'day' : q.period ?? 'day') as Period;
  if (!PERIODS.has(period)) return 'period must be day|month|year';
  const date = q.date ?? localDate(new Date(), TZ);
  if (!isDate(date)) return 'date must be YYYY-MM-DD';
  return { period, date };
}

app.get<{ Querystring: { period?: string; date?: string } }>('/api/summary', async (req, reply) => {
  const r = parseRange(req.query);
  if (typeof r === 'string') return reply.code(400).send({ error: r });
  return svc.summary(r.period, r.date);
});

app.get<{ Querystring: { period?: string; date?: string; kind?: string; keys?: string } }>('/api/series', async (req, reply) => {
  const r = parseRange(req.query);
  if (typeof r === 'string') return reply.code(400).send({ error: r });
  const kind = (req.query.kind ?? 'energy') as SeriesKind;
  if (kind !== 'energy' && kind !== 'gauge') return reply.code(400).send({ error: 'kind must be energy|gauge' });
  const keys = (req.query.keys ?? '').split(',').filter(Boolean);
  const allowed = kind === 'energy' ? ENERGY_KEYS : GAUGE_KEYS;
  const bad = keys.filter((k) => !allowed.has(k));
  if (!keys.length || keys.length > 8 || bad.length) return reply.code(400).send({ error: `invalid keys: ${bad.join(',') || '(none)'}` });
  return svc.series(kind, keys, r.period, r.date);
});

app.get<{ Querystring: { period?: string; date?: string } }>('/api/allocation', async (req, reply) => {
  const r = parseRange(req.query);
  if (typeof r === 'string') return reply.code(400).send({ error: r });
  return svc.allocation(r.period, r.date);
});

app.get<{ Querystring: { period?: string; date?: string } }>('/api/yield', async (req, reply) => {
  const r = parseRange(req.query);
  if (typeof r === 'string') return reply.code(400).send({ error: r });
  return svc.yield(r.period, r.date);
});

app.get('/api/assets', async () => svc.assets());

app.get('/api/tariffs', async () => tariffs.list());

app.put<{ Body: Tariff[] }>('/api/tariffs', { bodyLimit: 64 * 1024 }, async (req, reply) => {
  const err = validateTariffs(req.body);
  if (err) return reply.code(400).send({ error: err });
  tariffs.replace(req.body);
  req.log.info(`tariffs saved (${req.body.length})`);
  return tariffs.list();
});

app.get<{ Querystring: { period?: string; date?: string } }>('/api/costs', async (req, reply) => {
  const r = parseRange(req.query);
  if (typeof r === 'string') return reply.code(400).send({ error: r });
  return svc.costs(r.period, r.date, tariffs.list(), tariffs.version());
});

// Server-Sent Events: Live-Snapshot alle LIVE_INTERVAL_MS
app.get('/api/stream', (req, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let closed = false;
  const send = async () => {
    try {
      const data = await svc.live();
      if (!closed) reply.raw.write(`event: live\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (e) {
      if (!closed) reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: (e as Error).message })}\n\n`);
      req.log.warn(e, 'live query failed');
    }
  };
  void send();
  const timer = setInterval(send, LIVE_INTERVAL_MS);
  req.raw.on('close', () => {
    closed = true;
    clearInterval(timer);
  });
});

// Frontend (gebaute PWA) ausliefern
const here = dirname(fileURLToPath(import.meta.url));
const webDist = [resolve(here, '../../web/dist'), resolve(here, '../web')].find((p) => existsSync(p));
if (webDist) {
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((req, reply) =>
    req.url.startsWith('/api/') ? reply.code(404).send({ error: 'not found' }) : reply.sendFile('index.html'),
  );
}

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`smarthome-api ${VERSION} source=${svc.source} live=${feed ? 'mqtt+influx' : svc.source} web=${webDist ?? 'none'} auth=${auth ? (auth.everywhere ? 'everywhere' : 'external') : 'off'}`);
});

const shutdown = () => app.close().then(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
