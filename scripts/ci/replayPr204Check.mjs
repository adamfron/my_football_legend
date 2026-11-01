// The original decision checker requires its exact source. Run it unchanged in
// an isolated PR204 tree; do not overwrite or rebind any historical receipt.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { resolve, join, sep, basename, dirname } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr205SourceGuard.mjs';

mkdirSync('.benchmark-artifacts', { recursive: true });
const root = resolve('.'),
  scratch = mkdtempSync(resolve('.benchmark-artifacts/pr204-check-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr204-check-'),
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
  for (const file of ['docs/performance/pr204/decision-corpus.json']) {
    const target = join(scratch, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
  const env = {
    ...process.env,
    GIT_DIR: resolve('.git'),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: join(scratch, 'private.index'),
  };
  execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
  execFileSync(
    process.execPath,
    ['scripts/checkPr204Decisions.mjs', 'docs/performance/pr204/decision-corpus.json', '--replay'],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  console.log('PR204 original decision checker PASS in isolated historical source');
} finally {
  safe();
  rmSync(scratch, { recursive: true, force: true });
}
