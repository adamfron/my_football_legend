import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync, lstatSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE } from './pr200Evidence.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr199-baseline-'));
const safe = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr199-baseline-')
  )
    throw Error('Unsafe historical scratch');
};
safe();
const cleanup = () => {
  safe();
  for (const path of [join(scratch, 'node_modules'), join(scratch, '.git')]) {
    try {
      if (!lstatSync(path).isSymbolicLink()) throw Error('Unsafe scratch link');
      rmSync(path, { force: true, recursive: true });
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  rmSync(scratch, { recursive: true, force: true });
};
try {
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
      'docs/match-engine',
      'docs/PR199_BALL_FLIGHT_PERCEPTION_RECEIVER_FORENSICS_AND_VALIDATION_PROGRESS.md',
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  for (const [target, path] of [
    [resolve('node_modules'), join(scratch, 'node_modules')],
    [resolve('.git'), join(scratch, '.git')],
  ])
    symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
  // Git does not traverse a POSIX directory symlink when comparing tracked files.
  // Materialize the immutable receipts, and give this work tree its own baseline index.
  for (const pr of [195, 196, 197, 198, 199])
    cpSync(resolve(`docs/performance/pr${pr}`), join(scratch, `docs/performance/pr${pr}`), {
      recursive: true,
    });
  const historicalEnv = {
    ...process.env,
    GIT_INDEX_FILE: join(scratch, 'baseline.index'),
    GIT_WORK_TREE: scratch,
    NODE_OPTIONS: '--max-semi-space-size=64',
  };
  execFileSync('git', ['read-tree', BASE], { cwd: scratch, env: historicalEnv, windowsHide: true });
  const npm = process.env.npm_execpath;
  if (!npm) throw Error('Invoke historical check through npm');
  execFileSync(process.execPath, [npm, 'run', 'benchmark:pr199:check'], {
    cwd: scratch,
    stdio: 'inherit',
    windowsHide: true,
    env: historicalEnv,
  });
  console.log('PR199 immutable merged-source expectations PASS', BASE);
} finally {
  cleanup();
}
