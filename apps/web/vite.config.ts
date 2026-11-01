import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Cache-Buster für die App-Symbole aus ihrem Inhalt: neues Symbol = neue URL (Browser cachen Favicons sehr lange)
const ICON_V = createHash('sha1')
  .update(['favicon.png', 'apple-touch-icon.png', 'icon-fg.png'].map((f) => readFileSync(new URL(`public/${f}`, import.meta.url))).reduce((a, b) => Buffer.concat([a, b])))
  .digest('hex')
  .slice(0, 8);

export default defineConfig({
  define: { __ICON_V__: JSON.stringify(ICON_V) },
  plugins: [
    { name: 'icon-version', transformIndexHtml: (html) => html.replace(/\?v=__ICON_V__/g, `?v=${ICON_V}`) },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon-fg.png'],
      manifest: {
        name: 'Flux – Energie',
        short_name: 'Flux',
        description: 'Energieflüsse, Verbrauch und Klima zuhause',
        lang: 'de-AT',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ['push-sw.js'], // Web Push (public/push-sw.js)
        runtimeCaching: [
          { urlPattern: /\/api\/summary/, handler: 'NetworkFirst', options: { cacheName: 'api-summary', networkTimeoutSeconds: 4 } },
          { urlPattern: /\/api\/live/, handler: 'NetworkFirst', options: { cacheName: 'api-live', networkTimeoutSeconds: 3 } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: 'CacheFirst', options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } } },
        ],
      },
    }),
  ],
  // API_PROXY: z.B. http://localhost:8091 für die Dev-API auf dem Pi (npm run dev:pi)
  server: { proxy: { '/api': process.env.API_PROXY ?? 'http://localhost:8090' } },
});
