import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
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

// Use npx to run tsc, which works in CI/Vercel environments where tsc isn't in PATH
// The -b flag enables project references (build mode)
execSync(`npx tsc -b ${projects.join(' ')}`, {
  cwd: repoRoot,
  stdio: 'inherit',
});

mkdirSync(dist, { recursive: true });
copyFileSync(resolve(root, 'index.html'), resolve(dist, 'index.html'));
copyFileSync(resolve(root, 'src', 'style.css'), resolve(dist, 'style.css'));
mkdirSync(resolve(dist, 'styles'), { recursive: true });
copyFileSync(resolve(root, 'src', 'styles', 'theme.css'), resolve(dist, 'styles', 'theme.css'));

const packageRoots = [
  'packages/shared',
  'packages/core',
  'packages/geo',
  'packages/engine',
  'packages/engine-backends',
  'packages/engine-webgpu',
];
const packagesOut = resolve(dist, 'packages');
mkdirSync(packagesOut, { recursive: true });
for (const packageRoot of packageRoots) {
  const packageName = packageRoot.split('/').pop();
  if (!packageName) continue;
  const packageDist = resolve(repoRoot, packageRoot, 'dist');
  if (!existsSync(packageDist)) continue;
  const destination = resolve(packagesOut, packageName, 'dist');
  mkdirSync(resolve(packagesOut, packageName), { recursive: true });
  cpSync(packageDist, destination, { recursive: true });
}
