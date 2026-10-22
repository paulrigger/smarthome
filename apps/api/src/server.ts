import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Health, Period } from '@smarthome/shared';
import { InfluxSource } from './sources/influx';
import { influxService, mockService, type DataService } from './service';

const VERSION = process.env.APP_VERSION ?? 'dev';
const PORT = Number(process.env.PORT ?? 8090);
const TZ = process.env.APP_TZ ?? 'Europe/Vienna';
const LIVE_INTERVAL_MS = Number(process.env.LIVE_INTERVAL_MS ?? 5000);

const useMock = process.env.MOCK === '1' || !process.env.INFLUX_TOKEN;
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
    );

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });

app.get('/api/health', async (): Promise<Health> => {
  const influx = await svc.ping();
  return { ok: influx.ok, version: VERSION, source: svc.source, influx };
});

app.get('/api/live', () => svc.live());

app.get<{ Querystring: { period?: string } }>('/api/summary', async (req, reply) => {
  const period = (req.query.period ?? 'today') as Period;
  if (period !== 'today' && period !== 'month') return reply.code(400).send({ error: 'period must be today|month' });
  return svc.summary(period);
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
  app.log.info(`smarthome-api ${VERSION} source=${svc.source} web=${webDist ?? 'none'}`);
});

const shutdown = () => app.close().then(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
