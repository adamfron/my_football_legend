// Original PR216 checker and all physical receipts execute in their exact merged tree.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, symlinkSync, rmSync, readFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE } from '../pr217Evidence.mjs';
import { checkPr217Source } from '../pr217Evidence.mjs';
checkPr217Source();
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr216-check-'));
const safe = () => assert.ok(resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep));
try {
  safe();
  const tar = join(scratch, 'source.tar');
  const inputPath =
    'docs/performance/PR188-match-dev-sw-state-value-v1-full-observed-final-v1.json';
  const inputArchive = JSON.parse(readFileSync(inputPath)).archive;
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
      'docs/match-engine',
      inputPath,
      inputArchive,
      ...Array.from({ length: 22 }, (_, i) => `docs/performance/pr${195 + i}`),
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
    GIT_DIR: execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
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
      'scripts/benchmarkPr216.mjs',
      '--check',
    ],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  console.log('Original PR216 exact-source canonical replay PASS');
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
