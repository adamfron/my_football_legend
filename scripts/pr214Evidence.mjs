import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { pr211Source } from './pr211Evidence.mjs';
import { hash, normalized, write } from './pr199Evidence.mjs';
export const BASE = 'ac2b238b749fdf88de381a50fb7236cfe1141f41';
export const ROOT = 'docs/performance/pr214';
export { hash, write };
export const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
export const pr214Source = () => ({
  ...pr211Source(),
  ...Object.fromEntries(
    [
      'src/core/matchSimulation/sharedContactTimeline.test.ts',
      'src/core/matchSimulation/playerBodyContact.test.ts',
      'src/core/matchSimulation/multiBodyContact.test.ts',
      'src/core/matchSimulation/holisticDevelopment.test.ts',
    ].map((p) => [p, hash(normalized(p))]),
  ),
});
export const recordPr214Source = () => {
  const manifest = pr214Source(),
    fingerprint = hash(manifest);
  const baseline = read('docs/performance/pr213/source.json').manifest;
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
export const checkPr214Source = () => {
  const b = read(`${ROOT}/source.json`);
  assert.equal(hash(b.manifest), b.fingerprint);
  assert.deepEqual(pr214Source(), b.manifest, 'PR214 measured source drift');
  execFileSync(
    'git',
    [
      'diff',
      '--exit-code',
      BASE,
      '--',
      'package.json',
      'package-lock.json',
      ...Array.from({ length: 19 }, (_, i) => `docs/performance/pr${195 + i}`),
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  return { base: BASE, fingerprint: b.fingerprint, archive: b.archive };
};
