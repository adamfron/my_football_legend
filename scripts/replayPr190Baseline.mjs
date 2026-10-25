import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const base = '251ec9f88f212f7a93d26ebc7491b1176e5a25ef';
execFileSync('git', ['cat-file', '-e', `${base}^{commit}`]);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr190-replay-'));
const validate = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr190-replay-')
  )
    throw Error('Unsafe scratch path');
};
validate();
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', [
    '-c',
    'core.autocrlf=false',
    'archive',
    '--format=tar',
    `--output=${archive}`,
    base,
    'src',
    'scripts',
    'package.json',
    'docs/performance/pr189',
    'docs/performance/pr190',
  ]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  execFileSync(process.execPath, ['scripts/checkPr190Evidence.mjs'], {
    cwd: scratch,
    stdio: 'inherit',
    windowsHide: true,
  });
  execFileSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/replayPr190.mjs',
      '--check',
    ],
    { cwd: scratch, stdio: 'inherit', windowsHide: true },
  );
  console.log('PR190 frozen source, original captures and 250 artifacts PASS at ' + base);
} finally {
  validate();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
