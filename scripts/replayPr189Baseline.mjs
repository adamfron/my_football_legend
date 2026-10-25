import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const base = '1af5b5c130b8707c9febb77b7bbc7cbc36bd0ea1';
execFileSync('git', ['cat-file', '-e', `${base}^{commit}`]);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr189-replay-'));
const verify = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr189-replay-')
  )
    throw Error('Unsafe replay directory');
};
const gitDirectory = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
}).trim();
verify();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, base]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const commands = [
    ['benchmarkPr189Replay.mjs', '--version=restart', '--check'],
    ['replayPr189CycleOne.mjs', '--version=restart', '--check'],
    ['replayPr189CycleOne.mjs', '--cycle-two', '--version=restart', '--check'],
    ['replayPr189Restart.mjs', '--check'],
  ];
  for (const [file, ...args] of commands)
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${file}`,
        ...args,
      ],
      {
        cwd: scratch,
        stdio: 'inherit',
        env: { ...process.env, GIT_DIR: gitDirectory },
        windowsHide: true,
      },
    );
  execFileSync(process.execPath, ['scripts/checkPr189Evidence.mjs'], {
    cwd: scratch,
    stdio: 'inherit',
    windowsHide: true,
  });
  console.log(`PR189 immutable evidence and every original replay PASS at ${base}`);
} finally {
  verify();
  rmSync(join(scratch, 'node_modules'), { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}
