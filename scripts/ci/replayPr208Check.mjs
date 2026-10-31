// Original PR208 assertions, measurements and failures retain their exact source.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE, checkPr209Source } from '../pr209SourceGuard.mjs';
checkPr209Source();
const scratch = mkdtempSync(join(tmpdir(), 'pr209-history-208-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve(tmpdir()) + sep) &&
      basename(scratch).startsWith('pr209-history-208-'),
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
      ...Array.from({ length: 14 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
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
  execFileSync(
    process.execPath,
    ['scripts/checkPr208Evidence.mjs', ...(process.argv.includes('--replay') ? ['--replay'] : [])],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  if (process.argv.includes('--replay'))
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'docs/performance/pr208/trajectory-diagnostics-method.mjs',
        '--check',
      ],
      { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
    );
  console.log('Original PR208 source assertions and evidence PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
