import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { source, hash, normalized, write } from './pr199Evidence.mjs';
export const BASE = '0f817849e4f76aad9f72cb99b066895822ae9d42';
export const ROOT = 'docs/performance/pr211';
export { hash, write };
export const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
export const pr211Source = () => ({
  ...source(),
  ...Object.fromEntries(
    [
      'src/app/career/CareerCalendar.tsx',
      'src/app/match/TacticalMatchSandbox.tsx',
      'eslint.config.js',
      '.gitattributes',
      'vitest.config.ts',
      '.github/workflows/ci.yml',
      'src/core/matchSimulation/pendingStrike.test.ts',
    ].map((p) => [p, hash(normalized(p))]),
  ),
});
export const checkPr211Source = () => {
  const binding = read(`${ROOT}/source.json`);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr211Source(), binding.manifest, 'PR211 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 16 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
export const recordPr211Source = () => {
  const manifest = pr211Source(),
    fingerprint = hash(manifest);
  const baseline = {
    ...read('docs/performance/pr210/source.json').manifest,
    '.github/workflows/ci.yml': hash(
      execFileSync('git', ['show', `${BASE}:.github/workflows/ci.yml`], {
        encoding: 'utf8',
        windowsHide: true,
      }).replaceAll('\r\n', '\n'),
    ),
  };
  const archive = {
    base: BASE,
    fingerprint,
    manifest,
    baseline,
    removed: Object.keys(baseline).filter((p) => !(p in manifest)),
    contents: Object.fromEntries(
      Object.keys(manifest)
        .filter((p) => manifest[p] !== baseline[p])
        .map((p) => [p, normalized(p)]),
    ),
  };
  const path = `${ROOT}/source-${fingerprint}.json.gz`;
  if (!existsSync(path)) write(path, archive);
  // Refresh only the current pointer; all reconstructible source archives remain immutable.
  writeFileSync(
    `${ROOT}/source.json`,
    JSON.stringify({ base: BASE, fingerprint, manifest, archive: path }, null, 2) + '\n',
  );
  return { base: BASE, fingerprint, manifest, archive: path };
};
