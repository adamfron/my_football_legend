import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { hash, normalized, write, files } from './pr199Evidence.mjs';
export const BASE = '3873c736e1b76c3ea5d1a71a6c1ab637d9a42c10';
export const ROOT = 'docs/performance/pr216';
export const pr216Source = () =>
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
export const recordPr216Source = () => {
  const manifest = pr216Source(),
    fingerprint = hash(manifest);
  const baseline = JSON.parse(readFileSync('docs/performance/pr215/source.json')).manifest;
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
export const checkPr216Source = () => {
  const binding = JSON.parse(readFileSync(`${ROOT}/source.json`));
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr216Source(), binding.manifest, 'PR216 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 21 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
