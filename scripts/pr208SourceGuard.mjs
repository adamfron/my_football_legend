import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash } from './pr199Evidence.mjs';
export const BASE = 'c957f7d733420d72db43052432aa34f6bb7d77d9';
export function checkPr208Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr208/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR208 source differs from measured source');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 13 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
