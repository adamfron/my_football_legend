import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE } from './pr196Evidence.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr195-replay-'));
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const safe = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr195-replay-')
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
  const scripts = process.argv.includes('--historical')
    ? [
        ['replayPr193.mjs'],
        ['checkPr194Evidence.mjs'],
        ['benchmarkPr194Lab.mjs', '--version=v4'],
        ['benchmarkPr194Receiving.mjs'],
        ['replayPr194.mjs'],
      ]
    : [['pr195SourceInventory.mjs'], ['benchmarkPr195.mjs'], ['reportPr195.mjs']];
  for (const [script, ...args] of scripts)
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        '--check',
        ...args,
      ],
      {
        cwd: scratch,
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, GIT_DIR: gitDir },
      },
    );
  console.log('Frozen PR195 source and unchanged historical evidence PASS', BASE);
} finally {
  safe();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
