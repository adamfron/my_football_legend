import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hash, normalized, write, files } from './pr199Evidence.mjs';
export const BASE = '3aadeabdaac4bc9d038bf80399fd4a6f3e76a232';
export const ROOT = 'docs/performance/pr215';
export const pr215Source = () =>
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
export const recordPr215Source = () => {
  const manifest = pr215Source(),
    fingerprint = hash(manifest);
  const baseline = JSON.parse(readFileSync('docs/performance/pr214/source.json')).manifest;
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
};
export const checkPr215Source = () => {
  const binding = JSON.parse(readFileSync(`${ROOT}/source.json`));
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr215Source(), binding.manifest, 'PR215 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 20 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
