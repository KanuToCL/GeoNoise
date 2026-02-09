import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '..', '..');
const dist = resolve(root, 'dist');

const projects = [
  'packages/shared',
  'packages/core',
  'packages/geo',
  'packages/engine',
  'packages/engine-backends',
  'packages/engine-webgpu',
  'apps/web',
];

const tsc = spawn('tsc', ['-b', '--watch', ...projects], {
  cwd: repoRoot,
  stdio: 'inherit',
});

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function resolveFilePath(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') {
    return resolve(root, 'index.html');
  }

  if (urlPath === '/style.css') {
    return resolve(root, 'src', 'style.css');
  }

  if (urlPath.startsWith('/styles/')) {
    return resolve(root, 'src', urlPath.slice(1));
  }

  if (urlPath.startsWith('/packages/')) {
    const packageCandidate = resolve(repoRoot, `.${urlPath}`);
    if (existsSync(packageCandidate)) return packageCandidate;
  }

  if (urlPath.startsWith('/node_modules/')) {
    const moduleCandidate = resolve(repoRoot, `.${urlPath}`);
    if (existsSync(moduleCandidate)) return moduleCandidate;
  }

  const candidate = resolve(dist, `.${urlPath}`);
  if (existsSync(candidate)) return candidate;

  const rootCandidate = resolve(root, `.${urlPath}`);
  if (existsSync(rootCandidate)) return rootCandidate;

  return null;
}

const server = createServer((req, res) => {
  const urlPath = req.url ?? '/';
  const filePath = resolveFilePath(urlPath);

  if (!filePath) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = extname(filePath);
  const contentType = mimeTypes[ext] ?? 'application/octet-stream';

  try {
    const content = readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      res.end(content);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
});

const port = Number(process.env.PORT ?? 5173);
server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`GeoNoise web dev server running at http://localhost:${port}`);
});

process.on('SIGINT', () => {
  server.close();
  tsc.kill('SIGINT');
  process.exit(0);
});
