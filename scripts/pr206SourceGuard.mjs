import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash } from './pr199Evidence.mjs';

export const BASE = '30cfc99e00746cddd43e7df7281ab6f1c36d5516';
export function checkPr206Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr206/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR206 source differs from measured source');
  const historical = JSON.parse(readFileSync('docs/performance/pr205/current-source.json', 'utf8'));
  for (const [path, digest] of Object.entries(historical.manifest))
    if (path.startsWith('src/') || path.startsWith('package'))
      assert.equal(binding.manifest[path], digest, 'PR205 runtime identity changed: ' + path);
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'src',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 11 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
