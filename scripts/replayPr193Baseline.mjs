import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { PR193_BASE } from './pr194Evidence.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'mfl-pr193-replay-'));
const gitDir = execFileSync('git', ['rev-parse', '--absolute-git-dir'], {
  encoding: 'utf8',
}).trim();
const validate = () => {
  if (
    !resolve(scratch).startsWith(resolve(tmpdir()) + sep) ||
    !basename(scratch).startsWith('mfl-pr193-replay-')
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
    PR193_BASE,
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
    'benchmarkPr193Lab.mjs',
    'auditPr193IncidentalScoring.mjs',
    'replayPr193.mjs',
    'checkPr193Evidence.mjs',
  ])
    execFileSync(
      process.execPath,
      [
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/' + script,
        '--check',
        ...(script === 'benchmarkPr193Lab.mjs' ? ['--version=final-v6'] : []),
      ],
      {
        cwd: scratch,
        stdio: 'inherit',
        windowsHide: true,
        env: { ...process.env, GIT_DIR: gitDir },
      },
    );
  console.log('Frozen merged PR193 apparatus, hashes and original evidence PASS at ' + PR193_BASE);
} finally {
  validate();
  rmSync(join(scratch, 'node_modules'), { force: true, recursive: true });
  rmSync(scratch, { force: true, recursive: true });
}
