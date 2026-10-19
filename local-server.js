const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

// Server in-memory telemetry and alert store
const serverStore = {
  startTime: Date.now(),
  telemetryLogs: [],
  activeAlerts: [],
  serverState: null
};

// Helper to read JSON request body
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight Handler
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // REST Backend API Endpoints
  if (req.url.startsWith('/api/')) {
    const apiPath = req.url.split('?')[0];
    const jsonHeaders = {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    };

    // 1. Health check & status
    if (apiPath === '/api/health') {
      res.writeHead(200, jsonHeaders);
      res.end(JSON.stringify({
        status: 'online',
        service: 'SafeHaven Core Backend',
        port: PORT,
        version: '2.0.0',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: Date.now(),
        activeAlertsCount: serverStore.activeAlerts.length,
        telemetryPointsCount: serverStore.telemetryLogs.length
      }));
      return;
    }

    // 2. Telemetry ingestion (Child GPS & signal updates)
    if (apiPath === '/api/telemetry' && req.method === 'POST') {
      try {
        const data = await readJsonBody(req);
        data.receivedAt = Date.now();
        serverStore.telemetryLogs.unshift(data);
        if (serverStore.telemetryLogs.length > 200) serverStore.telemetryLogs.pop();
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ success: true, message: 'Telemetry synchronized with backend', record: data }));
      } catch (err) {
        res.writeHead(400, jsonHeaders);
        res.end(JSON.stringify({ error: 'Invalid telemetry payload' }));
      }
      return;
    }

    // 3. Emergency SOS broadcast
    if (apiPath === '/api/sos' && req.method === 'POST') {
      try {
        const data = await readJsonBody(req);
        data.id = 'sos-' + Date.now();
        data.timestamp = Date.now();
        serverStore.activeAlerts.unshift(data);
        console.log(`🚨 [BACKEND ALERT] Emergency SOS received for ${data.childName || 'Child'}!`);
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ success: true, alertId: data.id, message: 'Emergency SOS broadcasted by backend' }));
      } catch (err) {
        res.writeHead(400, jsonHeaders);
        res.end(JSON.stringify({ error: 'Invalid SOS payload' }));
      }
      return;
    }

    // 4. Check-in ("I'm Safe")
    if (apiPath === '/api/checkin' && req.method === 'POST') {
      try {
        const data = await readJsonBody(req);
        data.id = 'chk-' + Date.now();
        data.timestamp = Date.now();
        serverStore.activeAlerts.unshift(data);
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ success: true, message: 'Check-in recorded on server', record: data }));
      } catch (err) {
        res.writeHead(400, jsonHeaders);
        res.end(JSON.stringify({ error: 'Invalid check-in payload' }));
      }
      return;
    }

    // 5. State Synchronization
    if (apiPath === '/api/state') {
      if (req.method === 'GET') {
        res.writeHead(200, jsonHeaders);
        res.end(JSON.stringify({ state: serverStore.serverState || null, status: 'synced' }));
        return;
      }
      if (req.method === 'POST') {
        try {
          const body = await readJsonBody(req);
          serverStore.serverState = body;
          res.writeHead(200, jsonHeaders);
          res.end(JSON.stringify({ success: true, message: 'State synced to server' }));
        } catch (err) {
          res.writeHead(400, jsonHeaders);
          res.end(JSON.stringify({ error: 'Failed to sync state' }));
        }
        return;
      }
    }

    // Unmatched API endpoint
    res.writeHead(404, jsonHeaders);
    res.end(JSON.stringify({ error: 'API route not found' }));
    return;
  }

  // Static File Server
  let cleanUrl = decodeURIComponent(req.url.split('?')[0]);
  if (cleanUrl === '/' || cleanUrl === '') cleanUrl = '/index.html';

  // Resolve absolute file path securely
  const safeRelative = cleanUrl.replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.resolve(ROOT_DIR, '.' + safeRelative);

  // Security check: ensure path is within ROOT_DIR (case-insensitive for Windows)
  if (!filePath.toLowerCase().startsWith(ROOT_DIR.toLowerCase())) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden: Access outside root');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found: ' + cleanUrl);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = MIME_TYPES[ext] || 'application/octet-stream';
    if (cleanUrl.endsWith('manifest.json')) {
      contentType = 'application/manifest+json; charset=utf-8';
    }

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*'
    };


    if (cleanUrl === '/sw.js') {
      headers['Service-Worker-Allowed'] = '/';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is already in use by active SafeHaven process. Server is live at http://localhost:${PORT}/`);
  } else {
    console.error('Server error:', err);
  }
});

process.on('uncaughtException', (err) => {
  console.error('SafeHaven server uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('SafeHaven server unhandled rejection:', reason);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`SafeHaven 24/7 server running on port ${PORT}`);
});

