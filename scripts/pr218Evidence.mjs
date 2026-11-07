import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { files, hash, normalized, write } from './pr199Evidence.mjs';
export const BASE = '90eb730854240a949be61a344cf3955b31f3cfa0';
export const ROOT = 'docs/performance/pr218';
export const pr218Source = () =>
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
export const recordPr218Source = () => {
  const manifest = pr218Source(),
    fingerprint = hash(manifest);
  const baseline = JSON.parse(readFileSync('docs/performance/pr217/source.json')).manifest;
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
  const binding = { base: BASE, manifest, fingerprint, archive };
  writeFileSync(`${ROOT}/source.json`, JSON.stringify(binding, null, 2) + '\n');
  return binding;
};
export const checkPr218Source = () => {
  const binding = JSON.parse(readFileSync(`${ROOT}/source.json`));
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr218Source(), binding.manifest, 'PR218 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 23 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
