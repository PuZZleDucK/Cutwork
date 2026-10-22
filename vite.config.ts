import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  root: resolve('apps/web'),
  build: { outDir: resolve('dist/web'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173, proxy: { '/api': {
    target: 'http://127.0.0.1:9122', changeOrigin: true,
    configure(proxy) { proxy.on('proxyReq', request => {
      // Local-only development proxy; production is single-origin on 9122.
      request.setHeader('origin', 'http://127.0.0.1:9122');
    }); },
  } } },
});
