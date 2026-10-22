import {defineConfig} from 'astro/config';
import offlineStyles from './scripts/astro-offline.mjs';

// Astro builds static pages only. The existing Worker owns every API route.
export default defineConfig({
  site: 'https://wikiscroll.com',
  output: 'static',
  integrations: [offlineStyles()],
  build: {inlineStylesheets: 'never'},
  outDir: './dist',
  compressHTML: false,
  devToolbar: {enabled: false},
  server: {host: '127.0.0.1'},
  vite: {server: {proxy: {
    '/api': 'http://127.0.0.1:8787',
    '/collection': 'http://127.0.0.1:8787',
  }}},
});
