import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, join, dirname, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { hash } from '../../../../scripts/pr199Evidence.mjs';
import { checkPr215Source } from '../../../../scripts/pr215Evidence.mjs';
const binding = checkPr215Source();
const bytes = readFileSync(binding.archive);
const archive = JSON.parse(gunzipSync(bytes));
assert.equal(hash(archive.manifest), binding.fingerprint);
assert.deepEqual(archive.manifest, binding.manifest);
mkdirSync('.benchmark-artifacts', { recursive: true });
const scratch = mkdtempSync(resolve('.benchmark-artifacts/pr215-source-audit-'));
const safe = () => assert.ok(resolve(scratch).startsWith(resolve('.benchmark-artifacts') + sep));
try {
  safe();
  const tar = join(scratch, 'base.tar');
  execFileSync('git', ['archive', '--format=tar', `--output=${tar}`, binding.base,
    'src', 'scripts', 'package.json', 'package-lock.json', 'eslint.config.js',
    'vitest.config.ts', '.gitattributes', '.github'], { windowsHide: true });
  execFileSync('tar', ['-xf', tar, '-C', scratch], { windowsHide: true });
  for (const [path, text] of Object.entries(archive.contents)) {
    const target = resolve(scratch, path);
    assert.ok(target.startsWith(scratch + sep));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  for (const [path, digest] of Object.entries(binding.manifest))
    assert.equal(hash(readFileSync(join(scratch, path), 'utf8').replaceAll('\r\n', '\n')), digest, path);
  writeFileSync('docs/performance/pr215/source-archive-audit.json', JSON.stringify({
    source: binding.fingerprint, base: binding.base, entries: Object.keys(binding.manifest).length,
    overlayFiles: Object.keys(archive.contents).length, archive: binding.archive,
    archiveSha256: hash(bytes), result: 'PASS',
  }, null, 2) + '\n');
} finally {
  safe();
  rmSync(scratch, { recursive: true, force: true });
}
