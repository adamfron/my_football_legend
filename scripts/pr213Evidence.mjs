import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { pr211Source } from './pr211Evidence.mjs';
import { hash, write, normalized } from './pr199Evidence.mjs';
export const BASE = '44b2f1df70af49c4b0135849eeb67855440efa35';
export const ROOT = 'docs/performance/pr213';
export { hash, write };
export const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
const source = () => ({
  ...pr211Source(),
  ...Object.fromEntries(
    [
      'src/core/matchSimulation/sharedContactTimeline.test.ts',
      'src/core/matchSimulation/playerBodyContact.test.ts',
    ].map((p) => [p, hash(normalized(p))]),
  ),
});
export const recordPr213Source = () => {
  const manifest = source(),
    fingerprint = hash(manifest);
  const baseline = read('docs/performance/pr212/source.json').manifest;
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
};
export const checkPr213Source = () => {
  const binding = read(`${ROOT}/source.json`);
  assert.equal(hash(binding.manifest), binding.fingerprint);
  assert.deepEqual(source(), binding.manifest, 'PR213 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 18 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return { base: BASE, fingerprint: binding.fingerprint, archive: binding.archive };
};
