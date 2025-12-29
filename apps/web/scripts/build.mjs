import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

rmSync(dist, { recursive: true, force: true });

execFileSync('tsc', ['-b'], {
  cwd: root,
  stdio: 'inherit',
});

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, 'index.html'), resolve(dist, 'index.html'));
copyFileSync(resolve(root, 'src', 'style.css'), resolve(dist, 'style.css'));
