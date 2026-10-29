import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { BASE, read, hash, sourceArchiveSchema, FINAL_VERSION } from './pr203Evidence.mjs';
const receipt = read('docs/performance/pr203/current-source.json');
const archive = sourceArchiveSchema.parse(read(receipt.path));
assert.equal(hash(archive.manifest), receipt.fingerprint);
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr203-replay-'));
const safe = () =>
  assert.ok(
    resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep) &&
      basename(scratch).startsWith('pr203-replay-'),
  );
try {
  safe();
  const tar = join(scratch, 'source.tar');
  execFileSync(
    'git',
    [
      'archive',
      '--format=tar',
      `--output=${tar}`,
      BASE,
      'src',
      'scripts',
      'package.json',
      'package-lock.json',
    ],
    { windowsHide: true },
  );
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  for (const [p, t] of Object.entries(archive.contents)) {
    assert.ok(
      /^(src\/(core|schemas|types)\/|scripts\/|package(?:-lock)?\.json$)/.test(p) &&
        !p.split('/').includes('..'),
    );
    const target = resolve(scratch, p);
    assert.ok(target.startsWith(scratch + sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, t);
  }
  for (const [p, d] of Object.entries(archive.manifest))
    assert.equal(
      hash(readFileSync(join(scratch, p), 'utf8').replaceAll('\r\n', '\n')),
      d,
      `Archived bytes differ: ${p}`,
    );
  for (const name of ['docs', 'node_modules'])
    symlinkSync(
      resolve(name),
      join(scratch, name),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  for (const mode of ['awareness', 'support', 'roles', 'reception'])
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr203.mjs',
        `--mode=${mode}`,
        `--version=${FINAL_VERSION}`,
        '--check',
      ],
      { cwd: scratch, stdio: 'inherit', windowsHide: true },
    );
  console.log('PR203 reconstructed exact-source replay PASS', receipt.fingerprint);
} finally {
  safe();
  rmSync(scratch, { recursive: true, force: true });
}
