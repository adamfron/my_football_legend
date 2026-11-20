import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import process from 'node:process';

const root = resolve('.benchmark-artifacts');
mkdirSync(root, { recursive: true });
const results = [];
for (const [source, commands] of [
  [
    'a0fb76ebbf680676fabbaea8a69a5db53369d1b6',
    [['benchmarkPr220Placement.mjs', 'final', '--check']],
  ],
  [
    '6d59d05bdc1c40543a16c902447ef588de796978',
    [
      ['auditPr219Attempts.mjs'],
      ['benchmarkPr221Reception.mjs', '--check'],
      ['benchmarkPr222Reception.mjs', '--check'],
    ],
  ],
]) {
  const scratch = mkdtempSync(join(root, 'pr225-ancestor-'));
  assert.ok(scratch.startsWith(root + sep));
  try {
    const tar = join(scratch, 'source.tar');
    execFileSync(
      'git',
      ['-c', 'core.autocrlf=false', 'archive', '--format=tar', `--output=${tar}`, source],
      { stdio: 'inherit', windowsHide: true },
    );
    execFileSync('tar', ['-xf', tar, '-C', scratch], { stdio: 'inherit', windowsHide: true });
    for (const command of commands) {
      const loader =
        command[0] === 'benchmarkPr220Placement.mjs'
          ? 'registerPr220Lab.mjs'
          : 'registerTypescriptLoader.mjs';
      execFileSync(
        process.execPath,
        [
          '--experimental-transform-types',
          '--import',
          `./scripts/${loader}`,
          `scripts/${command[0]}`,
          ...command.slice(1),
        ],
        { cwd: scratch, stdio: 'inherit', windowsHide: true },
      );
      results.push({ source, command, passed: true });
    }
  } finally {
    assert.ok(resolve(scratch).startsWith(root + sep));
    rmSync(scratch, { recursive: true, force: true });
  }
}
writeFileSync(
  'docs/performance/pr225-ancestor-checks.json',
  JSON.stringify(
    { scope: 'source-bound controls; not changed-edition matches', results },
    null,
    2,
  ) + '\n',
);
