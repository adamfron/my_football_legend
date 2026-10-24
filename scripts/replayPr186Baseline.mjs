import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';

// Historical replay must execute the frozen historical code, not rewrite receipts
// to claim the current policy implementation generated PR186's measurements.
const base = '68487f1c0e16f32b840056550708832ac1a68cdf';
execFileSync('git', ['cat-file', '-e', `${base}^{commit}`]);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr186-replay-'));
if (
  !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
  !basename(scratch).startsWith('mfl-pr186-replay-')
)
  throw Error('Unsafe replay scratch path');
try {
  const archive = join(scratch, 'source.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${archive}`, base]);
  execFileSync('tar', ['-xf', archive, '-C', scratch]);
  symlinkSync(
    resolve('node_modules'),
    join(scratch, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  execFileSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr186.mjs',
      '--replay',
    ],
    { cwd: scratch, stdio: 'inherit' },
  );
  console.log(`PR186 frozen-source replay passed at ${base}`);
} finally {
  // Only the exact directory created by mkdtemp is removed; never follow the
  // dependency junction. Preserve the user's installed dependencies.
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
