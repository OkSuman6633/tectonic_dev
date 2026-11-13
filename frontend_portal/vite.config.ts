import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import http from 'http';

const BACKEND_PORT = Number(process.env.TECTONIC_BACKEND_PORT ?? 8000);
const BACKEND_HOST = process.env.TECTONIC_BACKEND_HOST ?? '127.0.0.1';
const BACKEND = `${BACKEND_HOST}:${BACKEND_PORT}`;
const PORT = Number(process.env.PORT ?? 5174);

function adkTransparentProxy(): Plugin {
  return {
    name: 'adk-transparent-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';
        const isAdkRoute = url === '/run' || url === '/run_sse' || url === '/list-apps' || url.startsWith('/apps');

        if (isAdkRoute) {
          const adkHeaders = {
            ...req.headers,
            host: BACKEND,
            origin: `http://${BACKEND}`,
            referer: `http://${BACKEND}/`
          };

          let upstream: http.IncomingMessage | null = null;
          const adkReq = http.request(
            {
              hostname: BACKEND_HOST,
              port: BACKEND_PORT,
              path: req.url,
              method: req.method,
              headers: adkHeaders
            },
            (adkRes) => {
              upstream = adkRes;
              if (res.destroyed) {
                adkRes.resume();
                return;
              }
              res.writeHead(adkRes.statusCode || 200, adkRes.headers);
              adkRes.pipe(res);
            }
          );

          res.on('close', () => {
            if (!res.writableFinished) upstream?.resume();
          });
          res.on('error', () => {});

          adkReq.on('error', (err) => {
            if (res.headersSent || res.destroyed) return;
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'ADK Backend connection error: ' + err.message }));
          });

          req.pipe(adkReq);
          return;
        }

        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), adkTransparentProxy()],
  server: {
    port: PORT,
    strictPort: true,
    host: true,
    proxy: {
      '/auth': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/api': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/directory': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/studio': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/modules': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/ws/telemetry': {
        target: `ws://${BACKEND}`,
        ws: true,
        changeOrigin: true,
      }
    }
  }
});

