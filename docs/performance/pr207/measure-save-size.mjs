import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import { createKickFixture } from '../../../src/core/matchSimulation/physicalKickLaboratory.ts';
import { resolveMatchAction } from '../../../src/core/matchSimulation/matchActions.ts';
import { tacticalMatchStateSchema } from '../../../src/core/matchSimulation/matchState.ts';
import { hash, source } from '../../../scripts/pr199Evidence.mjs';
const rows = [];
for (const family of ['pass', 'shot'])
  for (const experimental of [false, true]) {
    const f = createKickFixture({ seed: 'pr207-save-size', family, metres: 20, experimental });
    const state = resolveMatchAction(f.state, f.action, 'human_selected');
    const parsed = tacticalMatchStateSchema.parse(state);
    if (experimental) assert.deepEqual(parsed.lastKickExecution, state.lastKickExecution);
    rows.push({
      family,
      experimental,
      rawTacticalStateBytes: Buffer.byteLength(JSON.stringify(state)),
      schemaTacticalStateBytes: Buffer.byteLength(JSON.stringify(parsed)),
      lastReceiptBytes: state.lastKickExecution
        ? Buffer.byteLength(JSON.stringify(state.lastKickExecution))
        : 0,
    });
  }
const result = {
  schema: 'pr207-save-size-v1',
  source: hash(source()),
  methodSha256: hash(readFileSync(new URL(import.meta.url), 'utf8').replaceAll('\r\n', '\n')),
  classification:
    'serialized tactical state at release; not full career save or production match memory',
  rows,
};
const output = 'docs/performance/pr207/save-size.json';
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(readFileSync(output, 'utf8'))), hash(result));
else writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows));
