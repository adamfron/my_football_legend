import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pr211Source } from './pr211Evidence.mjs';
import { hash, write, normalized } from './pr199Evidence.mjs';
import { gunzipSync } from 'node:zlib';
export const BASE = 'a0b3396d2d0f2e81f68d2dbc65c6aedf92c8e7ae';
export const ROOT = 'docs/performance/pr212';
export { hash, write };
export const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
const source = () => ({
  ...pr211Source(),
  'src/core/matchSimulation/sharedContactTimeline.test.ts': hash(
    normalized('src/core/matchSimulation/sharedContactTimeline.test.ts'),
  ),
});
export const recordPr212Source = () => {
  const manifest = source(),
    fingerprint = hash(manifest);
  const baseline = read('docs/performance/pr211/source.json').manifest;
  const archive = `${ROOT}/source-${fingerprint}.json.gz`;
  if (!existsSync(archive))
    write(archive, {
      base: BASE,
      manifest,
      fingerprint,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => manifest[p] !== baseline[p])
          .map((p) => [p, normalized(p)]),
      ),
    });
  writeFileSync(
    `${ROOT}/source.json`,
    JSON.stringify({ base: BASE, manifest, fingerprint, archive }, null, 2) + '\n',
  );
  return { base: BASE, fingerprint, archive };
};
export const checkPr212Source = () => {
  const binding = read(`${ROOT}/source.json`);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR212 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 17 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return { base: BASE, fingerprint: binding.fingerprint, archive: binding.archive };
};
