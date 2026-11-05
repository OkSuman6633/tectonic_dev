import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import fs from 'fs';
import path from 'path';
import http from 'http';

// Backend (server.py) port; override with TECTONIC_BACKEND_PORT when 8000 is taken.
const BACKEND_PORT = Number(process.env.TECTONIC_BACKEND_PORT ?? 8000);
const BACKEND = `127.0.0.1:${BACKEND_PORT}`;

function backendBridgePlugin(): Plugin {
  return {
    name: 'backend-bridge',
    configureServer(server) {
      const projectRoot = path.resolve(__dirname, '..');
      const envPath = path.join(projectRoot, '.env');

      // Helper to read body from Node request
      const readBody = (req: any): Promise<string> => {
        return new Promise((resolve, reject) => {
          let data = '';
          req.on('data', (chunk: any) => { data += chunk; });
          req.on('end', () => resolve(data));
          req.on('error', reject);
        });
      };

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ? req.url.split('?')[0] : '';

        // 0. Transparent Proxy for ADK Backend Routes (Overriding Origin to prevent 403 Forbidden)
        const isAdkRoute = url === '/run' || url === '/run_sse' || url === '/list-apps' || url.startsWith('/apps');
        if (isAdkRoute) {
          const adkHeaders = {
            ...req.headers,
            host: BACKEND,
            origin: `http://${BACKEND}`,
            referer: `http://${BACKEND}/`
          };

          // A page refresh must not abort an agent run: ADK cancels /run when its client disconnects, so the
          // upstream request is kept open after the browser leaves and its reply drained. The reloaded Studio
          // then finds the finished turn in the session.
          let upstream: http.IncomingMessage | null = null;
          const adkReq = http.request(
            {
              hostname: '127.0.0.1',
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
          res.on('error', () => { /* the browser went away; the upstream run continues */ });

          adkReq.on('error', (err) => {
            if (res.headersSent || res.destroyed) return;
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'ADK Backend connection error: ' + err.message }));
          });

          req.pipe(adkReq);
          return;
        }

        // 1. GET /api/env
        if (url === '/api/env' && req.method === 'GET') {
          try {
            let content = '';
            if (fs.existsSync(envPath)) {
              content = fs.readFileSync(envPath, 'utf8');
            }
            const googleKeyMatch = content.match(/^GOOGLE_API_KEY=(.*)$/m);
            const geminiKeyMatch = content.match(/^GEMINI_API_KEY=(.*)$/m);
            const geminiModelMatch = content.match(/^GEMINI_MODEL=(.*)$/m);
            const rawKey = (googleKeyMatch ? googleKeyMatch[1].trim() : '') || (geminiKeyMatch ? geminiKeyMatch[1].trim() : '');
            const model = geminiModelMatch ? geminiModelMatch[1].trim() : 'gemini-3.6-flash';

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              hasKey: rawKey.length > 0,
              apiKey: rawKey,
              model: model,
              envExists: fs.existsSync(envPath)
            }));
            return;
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
            return;
          }
        }

        // 2. POST /api/env (Direct write to .env, ZERO LLM interaction)
        if (url === '/api/env' && req.method === 'POST') {
          try {
            const bodyStr = await readBody(req);
            const body = JSON.parse(bodyStr || '{}');
            const apiKey = (body.apiKey || '').trim();
            const model = (body.model || 'gemini-3.6-flash').trim();

            let currentEnv = '';
            if (fs.existsSync(envPath)) {
              currentEnv = fs.readFileSync(envPath, 'utf8');
            } else if (fs.existsSync(path.join(projectRoot, '.env.example'))) {
              currentEnv = fs.readFileSync(path.join(projectRoot, '.env.example'), 'utf8');
            }

            // Update or add GOOGLE_API_KEY
            if (/^GOOGLE_API_KEY=/m.test(currentEnv)) {
              currentEnv = currentEnv.replace(/^GOOGLE_API_KEY=.*$/m, `GOOGLE_API_KEY=${apiKey}`);
            } else {
              currentEnv = `GOOGLE_API_KEY=${apiKey}\n` + currentEnv;
            }

            // Update or add GEMINI_API_KEY
            if (/^GEMINI_API_KEY=/m.test(currentEnv)) {
              currentEnv = currentEnv.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${apiKey}`);
            } else {
              currentEnv = `GEMINI_API_KEY=${apiKey}\n` + currentEnv;
            }

            // Update or add GEMINI_MODEL
            if (/^GEMINI_MODEL=/m.test(currentEnv)) {
              currentEnv = currentEnv.replace(/^GEMINI_MODEL=.*$/m, `GEMINI_MODEL=${model}`);
            } else {
              currentEnv = `GEMINI_MODEL=${model}\n` + currentEnv;
            }

            // Ensure other default vars exist if missing
            if (!/^AGENT_BUILDER_OUTPUT_DIR=/m.test(currentEnv)) {
              currentEnv += `\nAGENT_BUILDER_OUTPUT_DIR=./generated_agents\nAGENT_BUILDER_LOG_DIR=./logs\nAGENT_BUILDER_TRACE_LEVEL=INFO\nAGENT_BUILDER_OTEL_CONSOLE=0\n`;
            }

            fs.writeFileSync(envPath, currentEnv, 'utf8');

            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              success: true,
              message: 'Successfully written Google API Key to .env without LLM interaction',
              hasKey: apiKey.length > 0,
              model
            }));
            return;
          } catch (e: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: e.message }));
            return;
          }
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), backendBridgePlugin()],
  server: {
    proxy: {
      // Sign-in, and each user's own generated agents (server.py serves both per signed-in user)
      '/auth': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      '/api/system': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      // Command Center telemetry stream from server.py
      '/ws/telemetry': { target: `ws://${BACKEND}`, ws: true, changeOrigin: true },
      // Agent directory: chat with / delete any agent from the Builder chat (server.py)
      '/directory': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      // Builder model choice and provider keys (server.py, applied live)
      '/studio': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      },
      // Shared core-module registry and live office simulation (server.py)
      '/modules': {
        target: `http://${BACKEND}`,
        changeOrigin: true,
        // The ADK server rejects unknown origins (403); present the backend's own origin, as the ADK proxy above does.
        configure: (proxy) => proxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('origin', `http://${BACKEND}`)),
      }
    }
  }
});
