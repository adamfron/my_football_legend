import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
const base = '9ea0e599f72800f4210092df2722e2ee16778ab7';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr191-replay-'));
const validate = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr191-replay-')
  )
    throw Error('Unsafe scratch');
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
    'docs/performance/pr191',
  ]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const run = (script) =>
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        script,
        '--check',
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
  run('scripts/benchmarkPr191.mjs');
  run('scripts/checkPr191Evidence.mjs');
  run('scripts/replayPr191.mjs');
  execFileSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/reconstructPr192Human.mjs',
      `--baseline-root=${scratch}`,
      '--check',
    ],
    { cwd: process.cwd(), stdio: 'inherit', windowsHide: true },
  );
  console.log('PR191 frozen source and original negative evidence PASS at ' + base);
} finally {
  validate();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
