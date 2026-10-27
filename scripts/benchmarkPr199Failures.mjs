import console from 'node:console';
import assert from 'node:assert/strict';
import { read, finish, identity, hash, options } from './pr199Evidence.mjs';
import { runPhysicalReception } from './pr199PhysicalLab.mjs';
import { cueFor } from './pr199FlightLab.mjs';
import { familyFixture } from './pr198Fixtures.mjs';
import {
  acquireFlightSighting,
  predictFlightBelief,
} from '../src/core/matchSimulation/ballFlightBelief.ts';
const source = identity(),
  rows = [];
const catalogue = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
const cases = [
  ['early_sighting_long_occlusion', 'cross_field', { condition: 'EARLY', duration: 0.05 }],
  [
    'late_reacquisition_insufficient_turn',
    'moving_lead',
    { condition: 'LATE', duration: 0.2, facingAway: true },
  ],
  ['incorrect_preparation_prior', 'long_lofted', { condition: 'CUE_ONLY', cues: true }],
  ['motor_speed_limited', 'moving_lead', { condition: 'FULL', attribute: 'pace', level: 20 }],
  ['unseen_bounce', 'long_lofted', { condition: 'EARLY', duration: 0.2 }],
  [
    'scanning_defender_attention_gap',
    'cross_field',
    { condition: 'FULL', attentionGap: [0.2, 0.7] },
  ],
  [
    'competing_movement_commitment',
    'moving_lead',
    { condition: 'FULL', competingCommitment: true },
  ],
  ['teammate_arrives_first', 'short_ground', { condition: 'FULL', teammateFirst: true }],
];
for (const [name, family, configuration] of cases)
  for (const sample of [0, 1])
    for (const controller of ['S', 'M']) {
      const entry = catalogue.find(
        (e) => e.family === family && e.skill === 60 && e.sample === sample,
      );
      const cue = cueFor(
        familyFixture(entry.family, entry.skill, entry.sample).state,
        entry.contract.actorId,
      );
      const config = { ...configuration, controller, cue, cues: configuration.cues ?? false };
      const result = runPhysicalReception(entry, config);
      rows.push({
        name,
        family,
        sample,
        config,
        ...result,
        limitation:
          'The scene names a controlled stressor, not a guaranteed miss, contact, teammate control or isolated proof of correct prediction.',
      });
    }
const first = acquireFlightSighting(
  undefined,
  {
    at: 1,
    position: { x: 10, y: 10, z: 1 },
    positionError: 0.03,
    motion: { since: 0.95, from: { x: 9, y: 10, z: 0.9 } },
  },
  60,
);
const hidden = predictFlightBelief(first, 1.4),
  before = hash(first);
const conflicting = acquireFlightSighting(
  first,
  { at: 1.4, position: { x: 5, y: 15, z: 0.5 }, positionError: 0.03 },
  60,
);
assert.equal(hash(first), before);
assert.deepEqual(predictFlightBelief(first, 1.4), hidden);
assert.ok(conflicting.contradicted && conflicting.velocity.x < 0);
finish(`failures-${options.get('version') ?? 'v1'}.json.gz`, {
  schema: 'pr199-failure-catalogue-v1',
  source,
  rows,
  conflictingObservations: { original: first, hiddenPrediction: hidden, revised: conflicting },
  unseenDeflection: {
    receipt: 'docs/performance/pr199/perception-v1.json.gz',
    family: 'deflected',
    method:
      'Canonical swept collision and rebound; every visibility variant shares the same physical trace. Old belief cannot change until acquisition.',
  },
  method:
    '32 canonical stressor continuations plus direct contradiction/unseen-memory invariance. Real finite reception outcomes and missing estimates retained.',
});
console.log('PR199 explicit failure continuations', rows.length);
