// Run the original PR203 checker against its exact merged source, without modifying it.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve, join, sep, basename, dirname } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { preserveHistoricalBytes } from './historicalBytes.mjs';

const base = '22d07d0a19149c240034801f55580c532bb62bd4';
const root = resolve('.');
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr203-check-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr203-check-'),
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
      base,
      'src',
      'scripts',
      'package.json',
      'package-lock.json',
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  preserveHistoricalBytes(scratch);
  const receipt = JSON.parse(readFileSync('docs/performance/pr203/current-source.json', 'utf8'));
  const inputs = [
    'docs/performance/pr203/current-source.json',
    receipt.path,
    ...['awareness', 'support', 'roles', 'reception'].map(
      (mode) => `docs/performance/pr203/${mode}-v2.json.gz`,
    ),
    'docs/performance/pr198/releases-v1.json.gz',
    'docs/performance/pr201/receivers-frozen-v1.json.gz',
    'docs/match-engine/ASSUMPTIONS_REGISTER.md',
  ];
  for (const input of inputs) {
    assert.ok(/^docs\//.test(input) && !input.split('/').includes('..'));
    const target = join(scratch, input);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(input, target);
  }
  // Git's checks examine the real current evidence and lockfile while source() reads
  // the isolated historical checkout. A private index avoids changing the user's index.
  const env = {
    ...process.env,
    GIT_DIR: resolve('.git'),
    GIT_WORK_TREE: root,
    GIT_INDEX_FILE: join(scratch, 'private.index'),
  };
  execFileSync('git', ['read-tree', base], { cwd: scratch, env, windowsHide: true });
  if (process.argv.includes('--probe-corruption')) {
    const file = join(scratch, 'src/core/matchSimulation/receivingPositions.ts');
    writeFileSync(file, readFileSync(file, 'utf8') + '\n// corruption probe\n');
  }
  execFileSync(
    process.execPath,
    [
      '--max-semi-space-size=64',
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/checkPr203Evidence.mjs',
    ],
    { cwd: scratch, env, stdio: 'inherit', windowsHide: true },
  );
  console.log('PR203 original checker PASS in isolated historical source');
} finally {
  safe();
  rmSync(scratch, { recursive: true, force: true });
}
