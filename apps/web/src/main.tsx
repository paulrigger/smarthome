import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MOCK } from './data';
import './styles.css';
import { installPalettes } from './themes';
import { installAppIcon } from './appIcon';

// Palette vor dem ersten Render setzen (kein Aufblitzen)
installPalettes();
installAppIcon();

if (!MOCK) {
  // Service Worker: lädt neue Versionen automatisch beim nächsten Öffnen
  import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true })).catch(() => undefined);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
