/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// ort-web referencia su .wasm con new URL(..., import.meta.url); Vite lo emitiría otra vez en assets/.
// La app lo sirve desde public/ort (wasmPaths), así que se descarta la copia duplicada (14 MB).
const dropDuplicateOrtWasm: Plugin = {
  name: 'drop-duplicate-ort-wasm',
  generateBundle(_opts, bundle) {
    for (const name of Object.keys(bundle)) if (/assets\/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
  },
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    dropDuplicateOrtWasm,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Jani',
        short_name: 'Jani',
        lang: 'es',
        start_url: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f1e7',
        theme_color: '#2f5d3a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // Precarga completa para modo avión (se afina en el prompt 11).
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,wasm,onnx,zip,mp3}'],
        maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
      },
    }),
  ],
  server: {
    // Permite importar packs/*.json desde la raíz del repo.
    fs: { allow: ['..'] },
  },
  test: {
    include: ['src/tests/**/*.test.ts'],
    environment: 'node',
  },
});
