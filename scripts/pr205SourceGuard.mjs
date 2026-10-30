import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash } from './pr199Evidence.mjs';

export const BASE = '372a2fda0b59a54706c6e11e63ef88ada48380a1';
export function checkPr205Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr205/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint, 'PR205 manifest identity');
  assert.deepEqual(source(), binding.manifest, 'Current source differs from measured PR205 source');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      ...Array.from({ length: 10 }, (_, i) => `docs/performance/pr${195 + i}`),
      'package-lock.json',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
