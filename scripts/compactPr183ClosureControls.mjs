import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { digest } from './pr183Evidence.mjs';
import console from 'node:console';
const compact = (name, project) => {
  const path = `docs/performance/${name}.json`;
  const old = JSON.parse(readFileSync(path));
  const full = old.detailArchive
    ? gunzipSync(readFileSync(`docs/performance/${old.detailArchive}`))
    : readFileSync(path);
  const archive = `pr183-evidence/${name}-details.json.gz`;
  const data = JSON.parse(full);
  writeFileSync(`docs/performance/${archive}`, gzipSync(full));
  writeFileSync(
    path,
    JSON.stringify(
      { ...project(data), detailArchive: archive, uncompressedDetailSha256: digest(full) },
      null,
      2,
    ) + '\n',
  );
};
compact('PR183-closure-retreat-reproductions', (d) => ({
  ...d,
  limitation:
    'Seven native complete states, five policy counterfactuals each, before rejected draft94550a3 and after the closure source identified on each row. First four are labelled same-seed PR182 mechanical reproductions, not exact original owner histories. Last three are exact deterministic reconstructions from consumed first-draft development/confirmation inputs. None is new independent evidence.',
  rows: d.rows.map(({ teammateDisplacement, ...row }) => ({
    ...row,
    teammateDisplacementCount: teammateDisplacement.length,
  })),
}));
compact('PR183-closure-carry-recovery', (d) => ({
  ...d,
  rows: d.rows.map(({ trajectory, ...row }) => ({ ...row, trajectorySamples: trajectory.length })),
}));
console.log('Closure controls packed losslessly.');
