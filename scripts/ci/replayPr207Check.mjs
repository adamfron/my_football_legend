// Original PR207 assertions run verbatim against their source-bound merged edition.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr208SourceGuard.mjs';
import { checkPr210Source } from '../pr210SourceGuard.mjs';
checkPr210Source();
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr207-check-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr207-check-'),
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
      '.gitattributes',
      'docs/performance/pr207',
      ...Array.from({ length: 12 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  preserveHistoricalBytes(scratch);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const env = {
    ...process.env,
    GIT_DIR: resolve('.git'),
    GIT_WORK_TREE: scratch,
    GIT_INDEX_FILE: join(scratch, 'private.index'),
  };
  execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
  const run = (args) =>
    execFileSync(process.execPath, args, {
      cwd: scratch,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
  run(['scripts/checkPr207Evidence.mjs']);
  run(['scripts/summarizePr207.mjs', '--check']);
  if (process.argv.includes('--replay')) {
    const flags = [
      '--max-semi-space-size=64',
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
    ];
    for (const mode of ['lab', 'live', 'explore'])
      run([...flags, 'scripts/benchmarkPr207.mjs', `--mode=${mode}`, '--check']);
    run([...flags, 'scripts/pr207PhysicalChecks.mjs', '--check']);
  }
  console.log('Original PR207 source assertions and frozen evidence PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
