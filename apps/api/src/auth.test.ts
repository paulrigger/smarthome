import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { authConfig, registerAuth, sign, verify } from './auth';

const cfg = authConfig({ AUTH_PASSWORD: 'geheim' })!;

async function app() {
  const a = Fastify();
  registerAuth(a, cfg);
  a.get('/api/live', async () => ({ ok: 1 }));
  a.get('/index.html', async () => 'html');
  return a;
}
const ext = { 'x-forwarded-for': '1.2.3.4' };

describe('auth', () => {
  it('Token: gültig, manipuliert, abgelaufen', () => {
    const t = sign(cfg.secret, Math.floor(Date.now() / 1000) + 60);
    expect(verify(cfg.secret, t)).toBe(true);
    // erstes Zeichen der Signatur ändern – das letzte trägt bei 32 Byte nur Füllbits (A/B dekodieren gleich)
    const [id, exp, mac] = t.split('.');
    expect(verify(cfg.secret, `${id}.${exp}.${mac[0] === 'A' ? 'B' : 'A'}${mac.slice(1)}`)).toBe(false);
    expect(verify(cfg.secret, sign(cfg.secret, 1))).toBe(false);
  });

  it('von außen nur mit Cookie, im Heimnetz frei, App-Hülle immer frei', async () => {
    const a = await app();
    expect((await a.inject({ url: '/api/live' })).statusCode).toBe(200);
    expect((await a.inject({ url: '/api/live', headers: ext })).statusCode).toBe(401);
    expect((await a.inject({ url: '/index.html', headers: ext })).statusCode).toBe(200);

    expect((await a.inject({ method: 'POST', url: '/api/login', headers: ext, payload: { password: 'falsch' } })).statusCode).toBe(401);
    const ok = await a.inject({ method: 'POST', url: '/api/login', headers: ext, payload: { password: 'geheim' } });
    expect(ok.statusCode).toBe(200);
    const cookie = String(ok.headers['set-cookie']);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    const live = await a.inject({ url: '/api/live', headers: { ...ext, cookie: cookie.split(';')[0] } });
    expect(live.statusCode).toBe(200);
  });

  it('sperrt nach 5 Fehlversuchen', async () => {
    const a = await app();
    const h = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < 5; i++) await a.inject({ method: 'POST', url: '/api/login', headers: h, payload: { password: 'x' } });
    expect((await a.inject({ method: 'POST', url: '/api/login', headers: h, payload: { password: 'geheim' } })).statusCode).toBe(429);
  });
});
