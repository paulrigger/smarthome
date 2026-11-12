import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MOCK } from './data';
import './styles.css';
import { installPalettes } from './themes';
import { installAppIcon } from './appIcon';
import { installSwUpdate } from './swUpdate';

// Push-Tippen bei offenem Fenster: der Service Worker schickt das Ziel, hier wird der Hash gesetzt
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'navigate' && typeof e.data.url === 'string') location.hash = new URL(e.data.url).hash;
});

// Palette vor dem ersten Render setzen (kein Aufblitzen)
installPalettes();
installAppIcon();

if (!MOCK) {
  // Service Worker: neue Version → Banner „Neu laden“ (components/UpdateBanner.tsx)
  installSwUpdate();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
