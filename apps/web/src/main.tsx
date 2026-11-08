import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MOCK } from './data';
import './styles.css';
import { installPalettes } from './themes';
import { installAppIcon } from './appIcon';
import { installSwUpdate } from './swUpdate';

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
