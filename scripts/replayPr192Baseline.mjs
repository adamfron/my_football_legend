import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { PR192_BASE } from './pr193Evidence.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr192-replay-'));
const validate = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr192-replay-')
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
    PR192_BASE,
    'src',
    'scripts',
    'package.json',
    'docs/performance',
  ]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  for (const script of [
    'benchmarkPr192Lab.mjs',
    'benchmarkPr192Flow.mjs',
    'benchmarkPr192Challenges.mjs',
    'replayPr192.mjs',
    'checkPr192Evidence.mjs',
  ])
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/' + script,
        '--check',
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
  console.log('Frozen merged PR192 apparatus, hashes and original evidence PASS at ' + PR192_BASE);
} finally {
  validate();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
