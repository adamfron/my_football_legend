import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash, normalized } from './pr199Evidence.mjs';

export const BASE = 'f2cab2a8b14d943e980e0665f2bc8ac3899d7fb9';
export const pr210Source = () => ({
  ...source(),
  ...Object.fromEntries(
    [
      'src/app/career/CareerCalendar.tsx',
      'src/app/match/TacticalMatchSandbox.tsx',
      'eslint.config.js',
      '.gitattributes',
      'vitest.config.ts',
    ].map((p) => [p, hash(normalized(p))]),
  ),
});
export const checkPr210Source = () => {
  const binding = JSON.parse(readFileSync('docs/performance/pr210/source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(pr210Source(), binding.manifest, 'PR210 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 15 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
};
