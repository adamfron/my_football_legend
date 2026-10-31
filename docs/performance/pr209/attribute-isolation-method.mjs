import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { source, hash } from '../../../scripts/pr199Evidence.mjs';
import {
  createTemporalStrikeFixture,
  sampleTemporalStrikeLabError,
} from '../../../src/core/matchSimulation/temporalStrikeLaboratory.ts';
import {
  prepareTemporalStrike,
  executeTemporalStrike,
} from '../../../src/core/matchSimulation/temporalFootStrike.ts';
const root = 'docs/performance/pr209',
  method = `${root}/attribute-isolation-method.mjs`;
const manifest = source();
const rows = JSON.parse(gunzipSync(readFileSync(`${root}/timing-development-v1.json.gz`))).receipt
  .result.skills;
const controls = [],
  groups = new Map();
for (const row of rows) {
  const f = createTemporalStrikeFixture(row.config);
  const normalized = globalThis.structuredClone(f.state);
  const attrs = normalized.players.find((p) => p.id === f.actor.id).profile.attributes;
  delete attrs.passing;
  delete attrs.finishing;
  delete attrs.technique;
  const group = JSON.stringify([
    row.config.seed,
    row.config.preparationSeconds,
    row.config.pressure,
  ]);
  if (groups.has(group)) assert.equal(hash(normalized), groups.get(group));
  else groups.set(group, hash(normalized));
  // The inherited PR207 fixture assigns both passing and unused finishing to primary.
  // Verify the inactive assignment cannot account for this pass-only experiment.
  for (const finishing of [1, 100]) {
    f.actor.profile.attributes.finishing = finishing;
    const error = sampleTemporalStrikeLabError(f);
    const plan = prepareTemporalStrike(f.state, f.actor, f.request);
    const actual = executeTemporalStrike(f.state, f.actor, plan, error.error);
    assert.deepEqual(error, row.error);
    assert.deepEqual(plan, row.plan);
    assert.deepEqual(actual, row.result);
    controls.push({
      config: row.config,
      finishing,
      resultHash: hash(actual),
      referenceHash: hash(row.result),
    });
  }
}
const error = (r) =>
  Math.hypot(
    r.result.contact.outgoingVelocity.x - 12,
    r.result.contact.outgoingVelocity.y,
    r.result.contact.outgoingVelocity.z,
  );
const contrasts = {};
for (const attribute of ['primary', 'technique']) {
  let wins = 0,
    losses = 0,
    ties = 0;
  for (const low of rows.filter((r) => r.config[attribute] === 25)) {
    const config = { ...low.config, [attribute]: 90 };
    const high = rows.find((r) => JSON.stringify(r.config) === JSON.stringify(config));
    if (error(high) < error(low)) wins++;
    else if (error(high) > error(low)) losses++;
    else ties++;
  }
  contrasts[attribute] = { wins, losses, ties };
}
assert.deepEqual(source(), manifest);
const result = {
  schema: 'pr209-attribute-isolation-v1',
  source: hash(manifest),
  method: { path: method, sha256: hash(readFileSync(method)) },
  qualification:
    'Passing and technique are active contrasts. The inherited fixture also changes unused finishing with primary; 512 complete-result interventions prove its inactivity for this pass-only primitive. No finishing skill curve is claimed.',
  matchedInputGroups: groups.size,
  finishingInterventions: controls.length,
  controls,
  contrasts,
};
const output = `${root}/attribute-isolation-v1.json.gz`;
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).result), hash(result));
else writeFileSync(output, gzipSync(JSON.stringify({ result }), { level: 9 }), { flag: 'wx' });
console.log(
  JSON.stringify({
    groups: groups.size,
    finishingInterventions: controls.length,
    contrasts,
    status: 'PASS',
  }),
);
