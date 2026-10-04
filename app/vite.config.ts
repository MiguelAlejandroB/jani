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
        background_color: '#EEF3EA',
        theme_color: '#1F4D2B',
        // Tamaño explícito y propósitos separados: Chrome avisa con sizes 'any' + 'any maskable'.
        icons: [
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precarga completa para modo avión: app, ort/*.wasm|mjs, models/** (model_card y .onnx),
        // packs/catalog.json y packs/*.zip (el audio va dentro de los zips). Soltar el modelo real en
        // public/models/arabica-v1/ y recompilar basta: el patrón ya lo cubre.
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,json,webmanifest,wasm,onnx,zip}'],
        // Lo que el notebook deja junto al modelo (zip de entrega, matrices de confusión, ejemplos) no lo usa la app.
        globIgnores: ['**/node_modules/**', 'models/**/*.zip', 'models/**/*.png'],
        navigateFallback: 'index.html',
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
