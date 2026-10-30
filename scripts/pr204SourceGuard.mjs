import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash } from './pr199Evidence.mjs';

export const BASE = '22d07d0a19149c240034801f55580c532bb62bd4';
export function checkPr204Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr204/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint, 'PR204 manifest fingerprint');
  assert.deepEqual(source(), binding.manifest, 'PR204 live source differs from measured source');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      ...[195, 196, 197, 198, 199, 200, 201, 202, 203].map((n) => `docs/performance/pr${n}`),
      'package-lock.json',
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
