const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded.replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative || 'index.html');
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  return file;
}

function resolveFile(urlPath) {
  const direct = safePath(urlPath);
  if (!direct) return null;
  try {
    if (fs.statSync(direct).isFile()) return direct;
    if (fs.statSync(direct).isDirectory()) {
      const nested = path.join(direct, 'index.html');
      if (fs.existsSync(nested)) return nested;
    }
  } catch (_) {}
  // Clean routes such as /academia/programa/ are handled by their folder index.
  if (!path.extname(direct)) {
    const nested = path.join(direct, 'index.html');
    if (fs.existsSync(nested)) return nested;
  }
  return null;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function serve(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': process.env.NODE_ENV === 'production' ? 'public, max-age=300' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  fs.createReadStream(file).on('error', () => {
    if (!res.headersSent) send(res, 500, 'No se pudo leer el recurso.');
    else res.destroy();
  }).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/health') {
    return send(res, 200, JSON.stringify({ ok: true, service: 'malba-pmc', version: 'node-static-foundation' }), MIME['.json']);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Método no permitido.');
  }
  const file = resolveFile(url.pathname);
  if (!file) return send(res, 404, 'Recurso no encontrado.');
  if (req.method === 'HEAD') {
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    return res.end();
  }
  return serve(res, file);
});

server.listen(PORT, '0.0.0.0', () => {
  if (process.env.NODE_ENV !== 'test') console.log(`MALBA PMC listening on ${PORT}`);
});

module.exports = server;
