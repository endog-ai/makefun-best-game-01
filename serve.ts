// Play LUMEN locally: `node serve.ts` serves game/ on http://localhost:8080.
// Node 22, standard library only, no build step. It answers GETs for files
// under game/ with the right content type and says 404 (or 403 for a path
// that escapes game/) for anything else. A dev convenience, not a server
// for the internet: it binds 127.0.0.1 and never writes anything.
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const port = (() => {
  const flag = process.argv.indexOf('--port');
  const value = flag === -1 ? process.argv[2] : process.argv[flag + 1];
  const n = Number(value ?? 8080);
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
})();

function contentType(file) {
  switch (extname(file).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.txt': return 'text/plain; charset=utf-8';
    case '.ico': return 'image/x-icon';
    case '.wasm': return 'application/wasm';
    default: return 'application/octet-stream';
  }
}

const server = createServer((request, response) => {
  let path = '/';
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(root, path));
  if (file !== root && !file.startsWith(`${root}/`)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let data;
  try {
    if (!statSync(file).isFile()) throw new Error('not a file');
    data = readFileSync(file);
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentType(file),
    'content-length': data.length,
    'cache-control': 'no-store',
  });
  response.end(data);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`LUMEN is on http://localhost:${port}`);
});
