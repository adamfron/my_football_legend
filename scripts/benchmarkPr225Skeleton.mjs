import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { matchInput, matchSeeds } from './benchmarkPr222Reception.mjs';
import { editions } from './benchmarkPr221Reception.mjs';
import { selectPr224Body } from './pr224Scenarios.ts';
import {
  withFullBodySkeleton,
  fullBodySkeletonSchema,
} from '../src/core/matchSimulation/fullBodySkeleton.ts';
import { projectCanonicalPlayerPresentation } from '../src/core/matchSimulation/canonicalPresentation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { captureReplaySnapshot } from '../src/core/matchSimulation/matchReplay.ts';

const hash = (x) =>
  createHash('sha256')
    .update(
      JSON.stringify(x, (_k, v) =>
        v && typeof v === 'object' && !Array.isArray(v)
          ? Object.fromEntries(
              Object.keys(v)
                .sort()
                .map((k) => [k, v[k]]),
            )
          : v,
      ),
    )
    .digest('hex');
const native = (s) => {
  try {
    return tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(s)));
  } catch (error) {
    writeFileSync(
      '.benchmark-artifacts/pr225-native-rejected.json.gz',
      gzipSync(JSON.stringify(s)),
    );
    throw error;
  }
};
const physical = (s) => {
  const { experimentalFullBodySkeleton: _edition, ...rest } = s;
  void _edition;
  return rest;
};
const extended = process.argv.includes('--extended'),
  ticks = extended ? 4800 : 1200;
const path = `docs/performance/pr225-skeleton-${extended ? '120' : '30'}s.json`;
const proof = { edition: 'full-body-skeleton-dev-v1', ticks, checkpoints: [], matches: [] },
  cost = [];
const read = (p) => JSON.parse(gunzipSync(readFileSync(p)));
const full = read('docs/performance/pr224-full-match-checkpoints.json.gz');
const ccd = read('docs/performance/pr224-ccd-checkpoints.json.gz');
const cases = [
  ...full.cases,
  full.remaining,
  ...ccd.cases,
  read('docs/performance/pr224-native-a-halt.json.gz'),
];
for (const [i, c] of cases.entries()) {
  const before = native(c.before ?? c.state),
    old = stepTacticalMatch(before, 0.025),
    candidate = stepTacticalMatch(withFullBodySkeleton(before), 0.025);
  assert.ok(!old.safetyHalt);
  assert.deepEqual(native(old), physical(native(candidate)));
  proof.checkpoints.push({
    name: c.name ?? `checkpoint-${i}`,
    at: before.time,
    hash: hash(native(old)),
    limbEvents: candidate.lastLimbContacts?.length ?? 0,
  });
}
for (const seed of matchSeeds) {
  const base = native({
    ...matchInput(seed),
    experimentalPostImpactStance: 'parked-stance-remainder-dev-v1',
    experimentalReceptionPreparation: editions.C,
  });
  for (const arm of ['D', 'E']) {
    let old = arm === 'E' ? selectPr224Body(base) : base,
      s = withFullBodySkeleton(native(old));
    let motorOld = 0,
      motorNew = 0,
      composition = 0,
      validation = 0,
      poses = 0,
      invalid = 0;
    const legs = [],
      boots = new Set(),
      passes = new Set();
    for (let i = 0; i < ticks; i++) {
      const at = s.time;
      let began = performance.now();
      old = stepTacticalMatch(old, 0.025);
      motorOld += performance.now() - began;
      began = performance.now();
      s = stepTacticalMatch(s, 0.025);
      motorNew += performance.now() - began;
      assert.ok(!s.safetyHalt, `${seed}/${arm}/${i}`);
      // Normalize only at a bounded cadence; compare all unnormalized physical
      // fields every step, retaining native reload checks separately.
      const actualPhysical = physical(s);
      if (JSON.stringify(old) !== JSON.stringify(actualPhysical))
        assert.deepEqual(actualPhysical, old, `physical divergence ${seed}/${arm}/${i}`);
      if (i % 40 === 0) assert.deepEqual(physical(native(s)), native(old));
      for (const c of s.lastLimbContacts ?? [])
        if (c.at > at) legs.push({ at: c.at, id: c.playerId, leg: c.leg });
      if (s.lastGroundContact?.executed) boots.add(s.lastGroundContact.at);
      if (s.lastPassDiagnostic) passes.add(s.lastPassDiagnostic.releasedAt);
      if (i % 8 === 0) {
        began = performance.now();
        for (const p of s.players) {
          const presentation = projectCanonicalPlayerPresentation(s, p);
          if (!presentation.fullBodySkeleton) invalid++;
          else {
            const validationAt = performance.now();
            fullBodySkeletonSchema.parse(presentation.fullBodySkeleton);
            validation += performance.now() - validationAt;
            poses++;
          }
        }
        composition += performance.now() - began;
      }
    }
    assert.equal(invalid, 0);
    const replay = captureReplaySnapshot(s, 0),
      legacy = captureReplaySnapshot(old, 0);
    proof.matches.push({
      seed,
      arm,
      physicalHash: hash(old),
      legHash: hash(legs),
      limbEvents: legs.length,
      bootEvents: boots.size,
      passReleases: passes.size,
      poses,
      invalid,
    });
    cost.push({
      seed,
      arm,
      motorOldMs: motorOld / ticks,
      motorNewMs: motorNew / ticks,
      compositionAndValidationMs: composition / poses,
      compositionMs: (composition - validation) / poses,
      validationMs: validation / poses,
      heapMiB: process.memoryUsage().heapUsed / 2 ** 20,
      nativeBytes: JSON.stringify(s).length,
      legacyNativeBytes: JSON.stringify(old).length,
      replayBytes: JSON.stringify(replay).length,
      legacyReplayBytes: JSON.stringify(legacy).length,
    });
    process.stdout.write(JSON.stringify({ proof: proof.matches.at(-1), cost: cost.at(-1) }) + '\n');
  }
}
if (process.argv.includes('--check'))
  assert.deepEqual(proof, JSON.parse(readFileSync(path, 'utf8')).proof);
if (process.argv.includes('--record'))
  writeFileSync(path, JSON.stringify({ proof, cost }, null, 2) + '\n');
