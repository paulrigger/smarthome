// Farbpaletten. Neue Palette = neuer Eintrag in PALETTES (dark + light), sonst nichts ändern.
// Jede Palette definiert alle Tokens; Komponenten verwenden nur var(--…).

export type Tokens = {
  bg: string; surface: string; 'surface-2': string; line: string; text: string; muted: string; structure: string;
  'c-sun': string; 'c-grid': string; 'c-battery': string; 'c-heat': string; 'c-car': string; 'c-warn': string; 'c-warmth': string;
  'flow-elec': string; 'flow-heat': string;
};

export interface Palette {
  id: string;
  name: string;
  note: string;
  dark: Tokens;
  light: Tokens;
}

export const PALETTES: Palette[] = [
  {
    id: 'mono',
    name: 'Schwarz-Weiß',
    note: 'Wie das E-Ink-Display. Energiearten über Graustufen und Linienmuster unterscheidbar.',
    dark: {
      bg: '#000000', surface: '#000000', 'surface-2': '#1c1c1c', line: '#3d3d3d', text: '#ffffff', muted: '#a6a6a6', structure: '#ffffff',
      'c-sun': '#ffffff', 'c-grid': '#b3b3b3', 'c-battery': '#7a7a7a', 'c-heat': '#ffffff', 'c-car': '#dedede', 'c-warn': '#ffffff', 'c-warmth': '#939393',
      'flow-elec': '#ffffff', 'flow-heat': '#939393',
    },
    light: {
      bg: '#ffffff', surface: '#ffffff', 'surface-2': '#ededed', line: '#cfcfcf', text: '#000000', muted: '#595959', structure: '#000000',
      'c-sun': '#000000', 'c-grid': '#4d4d4d', 'c-battery': '#8a8a8a', 'c-heat': '#000000', 'c-car': '#262626', 'c-warn': '#000000', 'c-warmth': '#6e6e6e',
      'flow-elec': '#000000', 'flow-heat': '#6e6e6e',
    },
  },
  {
    id: 'night',
    name: 'Nacht',
    note: 'Nachtblau mit eigener Farbe je Energieart.',
    dark: {
      bg: '#0f1b2a', surface: '#172739', 'surface-2': '#1e3248', line: '#2a4058', text: '#e8eef5', muted: '#8da0b5', structure: '#3b5878',
      'c-sun': '#ffc233', 'c-grid': '#8e9bff', 'c-battery': '#39d98a', 'c-heat': '#ff7a59', 'c-car': '#3fc8e8', 'c-warn': '#ffb020', 'c-warmth': '#ff5d8f',
      'flow-elec': '#ffd447', 'flow-heat': '#ff5d8f',
    },
    light: {
      bg: '#eef2f6', surface: '#ffffff', 'surface-2': '#e3e9f0', line: '#cbd5e0', text: '#12202e', muted: '#5b6b7c', structure: '#9fb0c2',
      'c-sun': '#d99a00', 'c-grid': '#5465e6', 'c-battery': '#16a463', 'c-heat': '#e0532f', 'c-car': '#0f97b8', 'c-warn': '#b86e00', 'c-warmth': '#d6336c',
      'flow-elec': '#d99a00', 'flow-heat': '#d6336c',
    },
  },
];

export const DEFAULT_PALETTE = 'mono';
export type Mode = 'system' | 'dark' | 'light';
export const DEFAULT_MODE: Mode = 'system';

const decl = (t: Tokens, scheme: 'dark' | 'light') =>
  `color-scheme:${scheme};` + Object.entries(t).map(([k, v]) => `--${k}:${v};`).join('');

/** CSS für alle Paletten: data-palette wählt die Palette, data-theme erzwingt hell/dunkel. */
export function paletteCss(): string {
  return PALETTES.map((p) => {
    const sel = `:root[data-palette='${p.id}']`;
    return [
      `${sel}{${decl(p.dark, 'dark')}}`,
      `@media (prefers-color-scheme: light){${sel}:not([data-theme='dark']){${decl(p.light, 'light')}}}`,
      `${sel}[data-theme='light']{${decl(p.light, 'light')}}`,
      `${sel}[data-theme='dark']{${decl(p.dark, 'dark')}}`,
    ].join('\n');
  }).join('\n');
}

const read = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};

export function loadAppearance(): { palette: string; mode: Mode } {
  const palette = read('palette', DEFAULT_PALETTE);
  const mode = read('mode', DEFAULT_MODE) as Mode;
  return {
    palette: PALETTES.some((p) => p.id === palette) ? palette : DEFAULT_PALETTE,
    mode: mode === 'dark' || mode === 'light' ? mode : 'system',
  };
}

/** Setzt Palette/Modus am <html> und merkt sie sich (pro Gerät). */
export function applyAppearance(palette: string, mode: Mode) {
  const root = document.documentElement;
  root.dataset.palette = palette;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
  try {
    localStorage.setItem('palette', palette);
    localStorage.setItem('mode', mode);
  } catch {
    /* privat-Modus */
  }
  // Statusleiste/Browserleiste an Hintergrund anpassen
  requestAnimationFrame(() => {
    const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  });
}

export function installPalettes() {
  const style = document.createElement('style');
  style.id = 'palettes';
  style.textContent = paletteCss();
  document.head.appendChild(style);
  const { palette, mode } = loadAppearance();
  applyAppearance(palette, mode);
}
