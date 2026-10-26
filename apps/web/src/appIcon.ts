// App-Symbol (Favicon + Homescreen-Icon) mit wählbarer Hintergrundfarbe, pro Gerät (localStorage) wie die Palette.
// Quelle: public/icon-fg.png (farbiges Symbol, transparent, erzeugt mit scripts/make_icons.py).
// Das Manifest-Icon (Android-Installation) bleibt statisch schwarz; iOS übernimmt das Icon beim „Zum Home-Bildschirm“.

export const ICON_BGS: { id: string; name: string; color: string }[] = [
  { id: 'black', name: 'Schwarz', color: '#000000' },
  { id: 'navy', name: 'Nachtblau', color: '#0f2a4f' },
  { id: 'anthracite', name: 'Anthrazit', color: '#2b2f36' },
  { id: 'green', name: 'Dunkelgrün', color: '#12372a' },
  { id: 'bordeaux', name: 'Bordeaux', color: '#4a1020' },
];

export const DEFAULT_ICON_BG = '#000000';
const KEY = 'iconBg';
const FG = 'icon-fg.png';

export function loadIconBg(): string {
  try {
    const v = localStorage.getItem(KEY);
    return v && /^#[0-9a-f]{6}$/i.test(v) ? v : DEFAULT_ICON_BG;
  } catch {
    return DEFAULT_ICON_BG;
  }
}

function saveIconBg(c: string) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* privat-Modus */
  }
}

/** Helle Hintergründe bekommen ein dunkles Symbol. */
export function iconInk(bg: string): string {
  const n = parseInt(bg.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#000000' : '#ffffff';
}

let fgImg: Promise<HTMLImageElement> | null = null;
const loadFg = () =>
  (fgImg ??= new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = FG;
  }));

/** Icon als PNG-Data-URL: Fläche in bg (optional abgerundet), Symbol mittig (zoom > 1 = größer als im Quellbild). */
async function render(bg: string, size: number, radius: number, zoom: number): Promise<string> {
  const img = await loadFg();
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * radius);
  ctx.fill();
  // Symbol einfärben (weiß oder dunkel) auf separater Ebene
  const s = size * zoom;
  const fg = document.createElement('canvas');
  fg.width = fg.height = size;
  const f = fg.getContext('2d')!;
  f.drawImage(img, (size - s) / 2, (size - s) / 2, s, s);
  f.globalCompositeOperation = 'source-in';
  f.fillStyle = iconInk(bg);
  f.fillRect(0, 0, size, size);
  ctx.drawImage(fg, 0, 0);
  return c.toDataURL('image/png');
}

function setLink(rel: string, href: string) {
  let l = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!l) {
    l = document.createElement('link');
    l.rel = rel;
    document.head.appendChild(l);
  }
  l.type = 'image/png';
  l.href = href;
}

/** Favicon und Homescreen-Icon in der Farbe setzen (und merken). Schwarz = statische Dateien. */
export async function applyIconBg(bg: string, persist = true) {
  if (persist) saveIconBg(bg);
  if (bg.toLowerCase() === DEFAULT_ICON_BG) {
    setLink('icon', 'favicon.png');
    setLink('apple-touch-icon', 'apple-touch-icon.png');
    return;
  }
  try {
    // icon-fg.png enthält das Symbol mit 74 % Kantenlänge; Favicon etwas größer für Lesbarkeit
    setLink('icon', await render(bg, 64, 0.22, 0.84 / 0.74));
    setLink('apple-touch-icon', await render(bg, 180, 0, 1));
  } catch {
    /* Symbol nicht ladbar (offline ohne Cache) – statische Icons bleiben */
  }
}

/** Beim Start: gespeicherte Farbe anwenden. */
export function installAppIcon() {
  const bg = loadIconBg();
  if (bg !== DEFAULT_ICON_BG) void applyIconBg(bg, false);
}
