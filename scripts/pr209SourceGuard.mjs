import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { source, hash, normalized } from './pr199Evidence.mjs';
export const BASE = '5353858065eaefdebfabacdd12a1a961bda36d74';
export function checkPr209Source() {
  const binding = JSON.parse(readFileSync('docs/performance/pr209/current-source.json', 'utf8'));
  assert.equal(binding.base, BASE);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR209 differs from its measured source');
  const historical = JSON.parse(readFileSync('docs/performance/pr208/current-source.json', 'utf8'));
  for (const [path, digest] of Object.entries(historical.manifest))
    if (path.startsWith('src/') || path.startsWith('package'))
      assert.equal(binding.manifest[path], digest, 'Historical production byte changed: ' + path);
  for (const path of Object.keys(binding.manifest).filter((p) => p.startsWith('src/'))) {
    if (path.endsWith('/temporalFootStrike.ts') || path.endsWith('/temporalStrikeLaboratory.ts'))
      continue;
    assert.ok(
      !/from ['"].*temporal(?:FootStrike|StrikeLaboratory)/.test(normalized(path)),
      'Temporal foundation unexpectedly installed in live code',
    );
  }
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 14 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return binding;
}
