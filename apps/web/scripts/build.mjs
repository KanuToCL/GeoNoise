import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(root, '..', '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });

const projects = [
  'packages/shared',
  'packages/core',
  'packages/geo',
  'packages/engine',
  'packages/engine-backends',
  'packages/engine-webgpu',
  'apps/web',
];

execFileSync('tsc', ['-b', ...projects], {
  cwd: repoRoot,
  stdio: 'inherit',
});

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, 'index.html'), resolve(dist, 'index.html'));
copyFileSync(resolve(root, 'src', 'style.css'), resolve(dist, 'style.css'));
