// Screenshots der App per Chrome DevTools Protocol (System-Chromium, ohne Playwright).
//   node scripts/shots.mjs <jobs.json> [outDir=.shots] [baseUrl=http://localhost:5173/]
// Job: { name, w, h, mobile, palette: mono|night, mode: light|dark, style: house|sankey|hub, period: day|month|year,
//        hash: "/" | "/kosten" | …, clickSel?: CSS-Selektor, clickWait?: ms, wait?: ms, full?: bool, reduce?: bool }
// Meldet je Job "ok" bzw. "BAD" (NaN/undefined im Text) und JS-Fehler der Seite.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [jobsFile, outDir = '.shots', base = 'http://localhost:5173/'] = process.argv.slice(2);
if (!jobsFile) {
  console.error('usage: node scripts/shots.mjs <jobs.json> [outDir] [baseUrl]');
  process.exit(2);
}
const jobs = JSON.parse(readFileSync(jobsFile, 'utf8'));
mkdirSync(outDir, { recursive: true });
const profile = resolve(outDir, '.profile');
rmSync(profile, { recursive: true, force: true }); // frisches Profil: kein veralteter Vite-Cache

const PORT = 9333;
const chrome = spawn('chromium', ['--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--lang=de-AT', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
const done = (code) => {
  chrome.kill();
  process.exit(code);
};
// Gesamtlimit: 90 s + je Job 60 s (Chromium auf dem Pi ist langsam)
setTimeout(() => (console.error('TIMEOUT'), done(1)), 90_000 + jobs.length * 60_000).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 150 && !wsUrl; i++) {
  await sleep(300);
  try {
    const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl;
  } catch {}
}
if (!wsUrl) (console.error('chromium not reachable'), done(1));

const ws = new WebSocket(wsUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) (pending.get(d.id)(d), pending.delete(d.id));
  if (d.method === 'Runtime.exceptionThrown') console.log('JS-ERROR', (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.log('CONSOLE-ERROR', JSON.stringify(d.params.args).slice(0, 300));
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: base });
await sleep(1500);

for (const j of jobs) {
  await send('Emulation.setDeviceMetricsOverride', { width: j.w, height: j.h, deviceScaleFactor: j.mobile ? 2 : 1, mobile: !!j.mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: j.mode ?? 'dark' }, { name: 'prefers-reduced-motion', value: j.reduce ? 'reduce' : 'no-preference' }] });
  const ls = { palette: j.palette ?? 'mono', mode: j.mode ?? 'dark', overviewStyle: j.style ?? 'house', period: j.period ?? 'day' };
  await evalJs(`${Object.entries(ls).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})`).join(';')}; true`);
  // Hash-Wechsel allein lädt nicht neu → navigieren + Reload, damit localStorage greift
  await send('Page.navigate', { url: base + '#' + (j.hash ?? '/') });
  await sleep(300);
  await send('Page.reload', { ignoreCache: true });
  await sleep(j.wait ?? 3500);
  if (j.clickSel) {
    const hit = await evalJs(`(() => { const e = document.querySelector(${JSON.stringify(j.clickSel)}); e && e.dispatchEvent(new MouseEvent('click', { bubbles: true })); return !!e; })()`);
    if (!hit) console.log(`${j.name}: clickSel not found`);
    await sleep(j.clickWait ?? 1500);
  }
  const full = j.full !== false;
  let clip;
  if (full) {
    const hgt = await evalJs('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
    clip = { x: 0, y: 0, width: j.w, height: Math.min(hgt, 6000), scale: 1 };
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip ? { clip } : {}) });
  writeFileSync(`${outDir}/${j.name}.png`, Buffer.from(shot.result.data, 'base64'));
  const bad = await evalJs(`[...document.querySelectorAll('text, span, dd, td')].map(e => e.textContent).filter(t => /NaN|undefined/.test(t)).slice(0,5)`);
  console.log(j.name, bad && bad.length ? 'BAD: ' + JSON.stringify(bad) : 'ok');
}
ws.close();
done(0);
