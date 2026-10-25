import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const base = 'a74be9ee846ac4958fd67e42795cf3d86946e937';
execFileSync('git', ['cat-file', '-e', `${base}^{commit}`]);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr188-replay-'));
const verifyScratch = () => {
  const target = resolve(scratch);
  if (
    !target.startsWith(resolve(tmpdir()) + sep) ||
    !basename(target).startsWith('mfl-pr188-replay-')
  )
    throw Error('Unsafe replay directory');
};
verifyScratch();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, base]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  execFileSync(process.execPath, ['scripts/recordPr188Evidence.mjs', '--check'], {
    cwd: scratch,
    stdio: 'inherit',
  });
  execFileSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/validatePr189FrozenReplay.mjs',
      `--engine-root=${scratch}`,
    ],
    { stdio: 'inherit' },
  );
  console.log(`PR188 immutable evidence and captured-state replay PASS at ${base}`);
} finally {
  verifyScratch();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
