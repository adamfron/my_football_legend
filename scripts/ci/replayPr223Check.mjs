import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';

const source = '6d59d05bdc1c40543a16c902447ef588de796978';
const root = resolve('.benchmark-artifacts');
mkdirSync(root, { recursive: true });
const scratch = mkdtempSync(join(root, 'pr223-check-'));
const tar = join(scratch, 'source.tar');
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, windowsHide: true, stdio: 'inherit' });

try {
  run('git', [
    '-c',
    'core.autocrlf=false',
    'archive',
    '--format=tar',
    `--output=${tar}`,
    source,
    'package.json',
    'src',
    'scripts',
    'docs/performance/pr217',
    'docs/performance/pr221',
    'docs/performance/pr222',
    'docs/performance/pr223',
  ]);
  run('tar', ['-xf', tar, '-C', scratch]);
  run(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr223Support.mjs',
      '--check',
    ],
    scratch,
  );
} finally {
  assert.ok(scratch.startsWith(root + sep));
  rmSync(scratch, { force: true, recursive: true });
}
