import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { files, hash, normalized, write } from './pr199Evidence.mjs';
export const BASE = 'd91852decfc523a2403460536ccc96da12c6ee17';
export const ROOT = 'docs/performance/pr217';
export const pr217Source = () =>
  Object.fromEntries(
    [
      ...files('src'),
      ...files('scripts'),
      'package.json',
      'package-lock.json',
      'eslint.config.js',
      'vitest.config.ts',
      '.gitattributes',
      '.github/workflows/ci.yml',
    ]
      .sort()
      .map((p) => [p, hash(normalized(p))]),
  );
export const recordPr217Source = () => {
  const manifest = pr217Source(),
    fingerprint = hash(manifest);
  const baseline = JSON.parse(readFileSync('docs/performance/pr216/source.json')).manifest;
  const archive = `${ROOT}/source-${fingerprint}.json.gz`;
  if (!existsSync(archive))
    write(archive, {
      base: BASE,
      manifest,
      fingerprint,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => baseline[p] !== manifest[p])
          .map((p) => [p, normalized(p)]),
      ),
    });
  writeFileSync(
    `${ROOT}/source.json`,
    JSON.stringify({ base: BASE, manifest, fingerprint, archive }, null, 2) + '\n',
  );
  return { base: BASE, manifest, fingerprint, archive };
};
export const checkPr217Source = () => {
  const binding = JSON.parse(readFileSync(`${ROOT}/source.json`));
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr217Source(), binding.manifest, 'PR217 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 22 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
