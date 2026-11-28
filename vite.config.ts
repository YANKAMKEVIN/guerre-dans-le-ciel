import { defineConfig } from 'vite';

// base relative : le site marche aussi bien à la racine qu'en sous-dossier (GitHub Pages /guerre-dans-le-ciel/)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 900, sourcemap: true },
  server: { port: 5417, strictPort: false },
  preview: { port: 5418, strictPort: false },
});
