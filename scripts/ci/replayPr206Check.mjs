// Preserve the original PR206 source assertion and all historical negative evidence.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, cpSync, symlinkSync, copyFileSync } from 'node:fs';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { preserveHistoricalBytes } from './historicalBytes.mjs';
import { BASE } from '../pr207SourceGuard.mjs';
mkdirSync('.benchmark-artifacts', { recursive: true });
const root = resolve('.'),
  scratch = mkdtempSync(resolve('.benchmark-artifacts/pr206-check-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr206-check-'),
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
  for (const pr of [205, 206])
    cpSync(`docs/performance/pr${pr}`, join(scratch, `docs/performance/pr${pr}`), {
      recursive: true,
    });
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const env = {
    ...process.env,
    GIT_DIR: resolve('.git'),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: join(scratch, 'private.index'),
  };
  execFileSync('git', ['read-tree', BASE], { cwd: scratch, env, windowsHide: true });
  execFileSync(process.execPath, ['scripts/checkPr206Evidence.mjs'], {
    cwd: scratch,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (process.argv.includes('--replay'))
    execFileSync(process.execPath, ['scripts/checkPr206Evidence.mjs', '--replay'], {
      cwd: scratch,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
  // Compare absent-selection runtime with merged PR206 using the SAME new scene setup.
  for (const path of [
    'src/core/matchSimulation/physicalKickLaboratory.ts',
    'scripts/pr207BaselineParity.mjs',
  ])
    copyFileSync(path, join(scratch, path));
  const command = [
    '--max-semi-space-size=64',
    '--experimental-transform-types',
    '--import',
    './scripts/registerTypescriptLoader.mjs',
    'scripts/pr207BaselineParity.mjs',
  ];
  const run = (cwd) =>
    execFileSync(process.execPath, command, { cwd, encoding: 'utf8', windowsHide: true });
  assert.deepEqual(
    JSON.parse(run(scratch)),
    JSON.parse(run(root)),
    'PR207 disabled runtime drifted from merged PR206',
  );
  console.log('Original PR206 evidence and disabled-path complete-state parity PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
