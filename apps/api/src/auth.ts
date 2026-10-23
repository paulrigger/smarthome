// Login per Cookie statt Basic Auth: iOS-Homescreen-Apps (PWA) merken sich Basic-Auth nicht,
// ein langlebiges HttpOnly-Cookie dagegen schon.
//
// Aktiv, wenn AUTH_PASSWORD in .env gesetzt ist. Geschützt werden nur Anfragen von außen,
// erkennbar am X-Forwarded-For-Header, den Caddy setzt. Im Heimnetz (direkt :8090) kein Login.
// AUTH_EVERYWHERE=1 schützt auch direkte Zugriffe.
import { createHmac, scryptSync, timingSafeEqual, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const COOKIE = 'haus_session';
const MAX_AGE_S = 400 * 24 * 3600; // Browser-Obergrenze für Cookies
const PUBLIC_API = new Set(['/api/health', '/api/auth', '/api/login', '/api/logout']);

export interface AuthConfig {
  password: string;
  secret: Buffer;
  everywhere: boolean;
}

export function authConfig(env = process.env): AuthConfig | null {
  const password = env.AUTH_PASSWORD;
  if (!password) return null;
  // Ohne eigenes Secret aus dem Passwort ableiten → Passwortwechsel meldet alle Geräte ab
  const secret = env.AUTH_SECRET ? Buffer.from(env.AUTH_SECRET) : scryptSync(password, 'haus-session', 32);
  return { password, secret, everywhere: env.AUTH_EVERYWHERE === '1' };
}

const b64 = (b: Buffer) => b.toString('base64url');

export function sign(secret: Buffer, exp: number, id = b64(randomBytes(9))): string {
  const payload = `${id}.${exp}`;
  return `${payload}.${b64(createHmac('sha256', secret).update(payload).digest())}`;
}

export function verify(secret: Buffer, token: string | undefined, now = Date.now()): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [id, exp, mac] = parts;
  const want = createHmac('sha256', secret).update(`${id}.${exp}`).digest();
  const got = Buffer.from(mac, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want) && Number(exp) * 1000 > now;
}

export function passwordOk(cfg: AuthConfig, input: unknown): boolean {
  if (typeof input !== 'string') return false;
  // Gleich lange Hashes vergleichen → kein Timing-Leck über die Länge
  const a = scryptSync(input, cfg.secret, 32);
  const b = scryptSync(cfg.password, cfg.secret, 32);
  return timingSafeEqual(a, b);
}

function readCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

const external = (req: FastifyRequest) => !!req.headers['x-forwarded-for'];

/** Fehlversuche je IP begrenzen (5 in 15 min). */
function limiter() {
  const fails = new Map<string, number[]>();
  const WINDOW = 15 * 60_000;
  return {
    blocked(ip: string, now = Date.now()) {
      const list = (fails.get(ip) ?? []).filter((t) => now - t < WINDOW);
      fails.set(ip, list);
      return list.length >= 5;
    },
    fail(ip: string) {
      fails.set(ip, [...(fails.get(ip) ?? []), Date.now()]);
    },
    reset(ip: string) {
      fails.delete(ip);
    },
  };
}

export function registerAuth(app: FastifyInstance, cfg: AuthConfig | null) {
  const needs = (req: FastifyRequest) => !!cfg && (cfg.everywhere || external(req));
  const authed = (req: FastifyRequest) => !needs(req) || verify(cfg!.secret, readCookie(req, COOKIE));
  const lim = limiter();
  const clientIp = (req: FastifyRequest) => String(req.headers['x-forwarded-for'] ?? req.ip).split(',')[0].trim();

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split('?')[0];
    // Nur Daten schützen. Die App-Hülle (HTML/JS/Icons) enthält nichts Privates und muss
    // ohne Login laden, damit Manifest, Icon und Login-Maske funktionieren.
    if (!path.startsWith('/api/') || PUBLIC_API.has(path)) return;
    if (!authed(req)) return reply.code(401).header('Cache-Control', 'no-store').send({ error: 'login required' });
  });

  app.get('/api/auth', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { required: needs(req), ok: authed(req) };
  });

  app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!cfg) return { ok: true };
    const ip = clientIp(req);
    if (lim.blocked(ip)) return reply.code(429).send({ error: 'Zu viele Versuche, bitte 15 Minuten warten.' });
    if (!passwordOk(cfg, req.body?.password)) {
      lim.fail(ip);
      req.log.warn({ ip }, 'login failed');
      return reply.code(401).send({ error: 'Passwort falsch' });
    }
    lim.reset(ip);
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
    const secure = external(req) || req.protocol === 'https' ? '; Secure' : '';
    reply.header('Set-Cookie', `${COOKIE}=${sign(cfg.secret, exp)}; Max-Age=${MAX_AGE_S}; Path=/; HttpOnly; SameSite=Lax${secure}`);
    return { ok: true };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.header('Set-Cookie', `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`);
    return { ok: true };
  });
}
