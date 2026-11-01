// Execute the original PR205 checker/commands against unchanged merged source.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr206SourceGuard.mjs';
mkdirSync('.benchmark-artifacts', { recursive: true });
const root = resolve('.'),
  scratch = mkdtempSync(resolve('.benchmark-artifacts/pr205-check-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr205-check-'),
  );
try {
  safe();
  const tar = join(scratch, 'source.tar');
  execFileSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      'archive',
      '--format=tar',
      `--output=${tar}`,
      BASE,
      'src',
      'scripts',
      'package.json',
      'package-lock.json',
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  preserveHistoricalBytes(scratch);
  for (const path of ['docs/performance/pr204', 'docs/performance/pr205'])
    cpSync(path, join(scratch, path), { recursive: true });
  const env = {
    ...process.env,
    GIT_DIR: resolve('.git'),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: join(scratch, 'private.index'),
  };
  execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
  execFileSync(process.execPath, ['scripts/checkPr205Evidence.mjs'], {
    cwd: scratch,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  console.log('PR205 original source-bound checker PASS in isolated merged source');
} finally {
  safe();
  rmSync(scratch, { recursive: true, force: true });
}
