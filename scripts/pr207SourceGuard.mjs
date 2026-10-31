import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash } from './pr199Evidence.mjs';
export const BASE = 'f61395cdf05194092f2ac5818e37404ee7d8fac3';
export function checkPr207Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr207/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR207 source differs from measured source');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 12 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
