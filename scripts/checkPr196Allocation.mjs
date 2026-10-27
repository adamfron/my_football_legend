import process from 'node:process';
import console from 'node:console';
import { files, read, hash, receipt } from './pr196Evidence.mjs';
const root = 'docs/performance/pr196',
  before = read(root + '/movement-v4.json.gz'),
  after = read(root + '/movement-v5.json.gz');
if (hash(before.rows) !== hash(after.rows))
  throw Error('Allocation optimization changed a measured movement row');
const paths = files(root + '/matches')
  .filter((p) => p.includes('-corrected-') && p.includes('-capture-') && p.endsWith('.json.gz'))
  .sort();
const final = new Map(),
  rows = [];
for (const path of paths.filter((p) => p.includes('-final-v1-'))) {
  const state = read(path).state;
  final.set(path.split('-corrected-')[0] + ':' + state.time.toFixed(6), {
    path,
    stateHash: hash(state),
  });
}
for (const path of paths.filter((p) => !p.includes('-final-v1-'))) {
  const state = read(path).state,
    next = final.get(path.split('-corrected-')[0] + ':' + state.time.toFixed(6));
  if (!next) continue;
  if (hash(state) !== next.stateHash) throw Error('Optimized full-match prefix changed ' + path);
  rows.push({ before: path, after: next.path, at: state.time, stateHash: next.stateHash });
}
if (rows.length < 60) throw Error('Incomplete full-prefix equivalence sample');
receipt(
  root + '/allocation-equivalence-v1.json',
  {
    schema: 'pr196-allocation-equivalence-v1',
    movementRows: before.rows.length,
    movementRowsHash: hash(before.rows),
    rows,
    classification:
      'Exact engine-consistency checks; no independent football validation or serial performance claim',
  },
  process.argv.includes('--check'),
);
console.log(
  'PR196 allocation equivalence PASS',
  before.rows.length,
  'movement rows',
  rows.length,
  'saved full-match prefix states',
);
