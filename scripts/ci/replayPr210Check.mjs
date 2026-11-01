// Original PR210 source guards and evidence run unchanged in their own merged source context.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE, checkPr211Source } from '../pr211Evidence.mjs';
checkPr211Source();
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr210-check-'));
const safe = () => assert.ok(resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep));
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
      'eslint.config.js',
      'vitest.config.ts',
      ...Array.from({ length: 16 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  // PR210 already contains the exact raw-byte rule; do not change its source-hashed attributes.
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
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/checkPr210Evidence.mjs',
      '--check',
      ...(process.argv.includes('--replay') ? ['--replay'] : []),
    ],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  console.log('Original merged PR210 source/evidence PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
