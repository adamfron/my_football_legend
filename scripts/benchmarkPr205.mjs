import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createPr205Fixture, sightPr205Ball } from '../src/core/matchSimulation/pr205Laboratory.ts';
import { projectLocomotion } from '../src/core/matchSimulation/locomotion.ts';
import {
  applyCanonicalBallControl,
  stepTacticalMatchAfterDecisionProbe as step,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { resolveContinuousGroundPassClaim } from '../src/core/matchSimulation/passClaimResolver.ts';
import * as local from '../src/core/matchSimulation/localReception.ts';
import { hash, source } from './pr199Evidence.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'development-v1';
assert.match(version, /^[a-z0-9-]+$/);
const historical = args.has('historical');
const mode = historical ? 'two-pass-continuity-dev-v1' : 'observed-ball-contact-dev-v1';
const started = performance.now(),
  cpu = process.cpuUsage(),
  manifest = source();
const physical = (s) => ({
  ball: s.ball,
  contact: s.lastGroundContact ?? null,
  reception: s.lastReceptionOutcome ?? null,
  possessionTeam: s.possessionTeam,
  loss: s.lastPossessionLoss ?? null,
  change: s.lastPossessionChange ?? null,
});
const labelled = (s, kind) => {
  const copy = globalThis.structuredClone(s);
  if (kind === 'loose') delete copy.ball.travelKind;
  else copy.ball.travelKind = kind;
  return copy;
};
const kinds = ['pass', 'cross', 'loose'];
const movement = [];
for (const condition of ['unseen', 'seen', 'stale', 'high', 'wrong_target']) {
  const { state: s, actor: p } = createPr205Fixture();
  s.prospectiveMovement = mode;
  s.ball.x = 54;
  s.ball.velocity = { x: 1, y: 0, z: 0 };
  if (condition !== 'unseen')
    sightPr205Ball(
      s,
      p.id,
      { x: 54, y: 34, z: condition === 'high' ? 30 : 0.11 },
      { x: 1, y: 0, z: condition === 'high' ? 20 : 0 },
    );
  if (condition === 'stale') s.time += 1;
  const recovery = local.locallyObservedRecovery?.(s, p);
  const target =
    condition === 'wrong_target'
      ? { x: 45, y: 30 }
      : (recovery?.movement.movementTarget ?? { x: 54, y: 34 });
  const arms = kinds.map((kind) => {
    const state = labelled(s, kind);
    return {
      kind,
      projection: projectLocomotion(state, p, target, null, recovery?.movement),
      recovery: local.locallyObservedRecovery?.(state, p) ?? null,
    };
  });
  movement.push({
    condition,
    commonInputHash: hash(s),
    at: s.time,
    observation: s.liveBallFlightRuntime?.sensors[p.id] ?? null,
    target,
    arms,
  });
}
const contacts = [];
for (const role of ['team', 'opponent', 'keeper'])
  for (const speed of [6, 18, 30]) {
    const { state: s, actor } = createPr205Fixture(role, speed);
    s.prospectiveMovement = mode;
    const direct = kinds.map((kind) => ({
      kind,
      result: physical(applyCanonicalBallControl(labelled(s, kind), actor.id)),
    }));
    const access = kinds.map((kind) => ({
      kind,
      result:
        resolveContinuousGroundPassClaim(
          labelled(s, kind),
          { x: 49.5, y: 34, z: 0.11 },
          { x: 50.2, y: 34, z: 0.11 },
        ) ?? null,
    }));
    const canonical = kinds.map((kind) => {
      const state = labelled(s, kind);
      state.ball.x = 49.9;
      state.ball.velocity.y = 0;
      const next = step(state, 0.025);
      return { kind, result: physical(next), actor: next.players.find((p) => p.id === actor.id) };
    });
    contacts.push({ role, speed, commonInputHash: hash(s), direct, access, canonical });
  }
const result = {
  qualification:
    'Synthetic paired development counterfactuals; keeper and high-body routes are measured without claiming parity.',
  mode,
  movement,
  contacts,
};
assert.deepEqual(source(), manifest, 'Source changed during the laboratory');
if (!historical) {
  for (const row of movement)
    for (const arm of row.arms.slice(1)) {
      assert.deepEqual(arm.projection, row.arms[0].projection, row.condition);
      assert.deepEqual(arm.recovery, row.arms[0].recovery, row.condition);
    }
  for (const row of contacts.filter((r) => r.role !== 'keeper')) {
    for (const arm of row.direct.slice(1))
      assert.deepEqual(arm.result, row.direct[0].result, `${row.role} ${row.speed} direct`);
    for (const arm of row.canonical.slice(1))
      assert.deepEqual(arm.result, row.canonical[0].result, `${row.role} ${row.speed} canonical`);
    for (const arm of row.access.slice(1))
      assert.deepEqual(arm.result, row.access[0].result, `${row.role} ${row.speed} access`);
  }
  for (const row of movement)
    assert.equal(
      row.arms[0].projection.intensity,
      row.condition === 'seen' ? 'sprint' : 'jog',
      row.condition,
    );
}
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
  peakRssKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const output = `docs/performance/pr205/${version}.json.gz`;
if (args.has('contracts')) {
  // CI verifies paired contracts in its own environment. Windows receipts are
  // separately replayed on Windows; no cross-platform long-match claim follows.
} else if (args.has('check')) {
  const saved = JSON.parse(gunzipSync(readFileSync(output)));
  assert.equal(hash(saved.result), hash(result), 'PR205 laboratory replay differs');
} else {
  mkdirSync('docs/performance/pr205', { recursive: true });
  writeFileSync(
    output,
    gzipSync(JSON.stringify({ source: hash(manifest), manifest, result, costs }), { level: 9 }),
    { flag: 'wx' },
  );
}
console.log(
  JSON.stringify({
    output,
    source: hash(manifest),
    costs,
    movement: movement.map((r) => ({
      condition: r.condition,
      arms: r.arms.map((a) => a.projection),
    })),
    contacts: contacts.map((r) => ({
      role: r.role,
      speed: r.speed,
      direct: r.direct.map((a) => ({
        kind: a.kind,
        owner: a.result.ball.ownerId ?? null,
        velocity: a.result.ball.velocity ?? null,
        contact: a.result.contact?.executed ?? false,
      })),
      canonical: r.canonical.map((a) => ({
        kind: a.kind,
        owner: a.result.ball.ownerId ?? null,
        velocity: a.result.ball.velocity ?? null,
        contact: a.result.contact?.executed ?? false,
      })),
    })),
  }),
);
