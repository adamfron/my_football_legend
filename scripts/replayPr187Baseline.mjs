import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';

// PR188 intentionally changes the evaluator. PR187's immutable receipts must be
// replayed with their frozen source, never regenerated with the new evaluator.
const base = '00fe1b5581ff5f83acb70194f6e78c3829fb4def';
execFileSync('git', ['cat-file', '-e', `${base}^{commit}`]);
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr187-replay-'));
const verifyScratch = () => {
  const target = resolve(scratch);
  if (
    !target.startsWith(resolve(tmpdir()) + sep) ||
    !basename(target).startsWith('mfl-pr187-replay-')
  )
    throw Error('Unsafe replay scratch path');
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
  for (const script of ['benchmarkPr187Research.mjs', 'recordPr187Evidence.mjs']) {
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        `scripts/${script}`,
        '--replay',
      ],
      { cwd: scratch, stdio: 'inherit' },
    );
  }
  console.log(`PR187 frozen-source research and index replay passed at ${base}`);
} finally {
  verifyScratch();
  // Remove the junction itself before its exact scratch parent, as in PR186.
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
