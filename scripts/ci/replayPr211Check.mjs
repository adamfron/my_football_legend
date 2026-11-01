// Preserve the original PR211 assertions and exact source in a real-file private-index export.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE, checkPr212Source } from '../pr212Evidence.mjs';
checkPr212Source();
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr211-check-'));
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
      '.github',
      ...Array.from({ length: 17 }, (_, i) => `docs/performance/pr${195 + i}`),
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
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr211.mjs',
      '--check',
    ],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  console.log('Original PR211 exact-source canonical replay PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
