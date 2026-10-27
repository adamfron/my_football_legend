import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { BASE } from './pr197Evidence.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr196-replay-'));
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const safe = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr196-replay-')
  )
    throw Error('Unsafe scratch path');
};
safe();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync(
    'git',
    [
      '-c',
      'core.autocrlf=false',
      'archive',
      '--format=tar',
      `--output=${archive}`,
      BASE,
      'src',
      'scripts',
      'docs',
      'package.json',
      'package-lock.json',
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', archive, '-C', scratch], { windowsHide: true });
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const scripts = [
    ['freezePr196Baseline.mjs'],
    ['checkPr196Evidence.mjs'],
    ['checkPr196Allocation.mjs'],
    ['checkPr196Snapshots.mjs'],
    ['benchmarkPr196Movement.mjs'],
    ['benchmarkPr196Passes.mjs'],
    ['benchmarkPr196LongPass.mjs'],
    ['benchmarkPr196RestartOutcomes.mjs'],
    ['benchmarkPr196Memoization.mjs'],
    ['benchmarkPr196DecisionCause.mjs'],
    ['summarizePr196.mjs'],
    ['reportPr196.mjs'],
  ];
  for (const [script] of scripts)
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        '--check',
      ],
      {
        cwd: scratch,
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, GIT_DIR: gitDir },
      },
    );
  console.log('Frozen PR196 laboratories and source PASS', BASE);
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
