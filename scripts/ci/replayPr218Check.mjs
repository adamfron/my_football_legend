import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import process from 'node:process';
import { checkPr218Source, MERGED_SOURCE } from '../pr218Evidence.mjs';

checkPr218Source();
const root = resolve('.benchmark-artifacts');
mkdirSync(root, { recursive: true });
const scratch = mkdtempSync(join(root, 'pr218-check-'));
const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const env = {
  ...process.env,
  GIT_DIR: gitDirectory,
  GIT_WORK_TREE: scratch,
  GIT_INDEX_FILE: join(scratch, 'private.index'),
};
const run = (cmd, args, context = {}) =>
  execFileSync(cmd, args, { windowsHide: true, stdio: 'inherit', ...context });

try {
  const tar = join(scratch, 'source.tar');
  run('git', [
    '-c',
    'core.autocrlf=false',
    'archive',
    '--format=tar',
    `--output=${tar}`,
    MERGED_SOURCE,
  ]);
  run('tar', ['-xf', tar, '-C', scratch]);
  run('git', ['read-tree', MERGED_SOURCE], { cwd: scratch, env });
  for (const script of ['benchmarkPr218.mjs', 'benchmarkPr218Match.mjs'])
    run(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        '--check',
      ],
      { cwd: scratch, env },
    );
} finally {
  assert.ok(scratch.startsWith(root + sep));
  rmSync(scratch, { recursive: true, force: true });
}
