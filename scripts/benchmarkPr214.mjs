import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { mkdirSync } from 'node:fs';
import { createPr214Scene, pr214Cases, tracePr214 } from './pr214Scenarios.ts';
import { createPr213Scene, tracePr213, normalizedPr213State } from './pr213Scenarios.ts';
import {
  holisticRecipe,
  withHolisticDevelopment,
  observeHolisticActivation,
} from './holisticDevelopment.ts';
import { holisticInventory } from './pr214Inventory.mjs';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  integrationProfileIdSchema,
  resolveIntegrationProfile,
  withIntegrationProfile,
} from '../src/core/matchSimulation/integrationProfile.ts';
import { ROOT, hash, write, read, recordPr214Source, checkPr214Source } from './pr214Evidence.mjs';
const check = process.argv.includes('--check');
const version = process.argv.find((a) => a.startsWith('--version='))?.split('=')[1] ?? 'ci-v1';
assert.match(version, /^[a-z0-9-]+$/);
mkdirSync(ROOT, { recursive: true });
if (process.argv.includes('--record-source')) recordPr214Source();
const source = checkPr214Source();
const started = performance.now(),
  cpu = process.cpuUsage();
const json = (x) => JSON.parse(JSON.stringify(x));
const rows = pr214Cases.map((name) => {
  const f = createPr214Scene(name),
    r = tracePr214(f.initial, f.config.ticks);
  const saves = [0, 2, 3, 4].map((ticks) => {
    const checkpoint = tracePr214(f.initial, ticks).state;
    const a = tracePr214(checkpoint, 8),
      b = tracePr214(normalizedPr213State(checkpoint), 8);
    assert.deepEqual(json(a.frames), json(b.frames), `${name}: schema reload`);
    return {
      ticks,
      bytes: Buffer.byteLength(JSON.stringify(normalizedPr213State(checkpoint))),
      pending: Boolean(checkpoint.pendingStrike),
      persistent: checkpoint.continuousPlayerContacts?.length ?? 0,
      terminal: hash(normalizedPr213State(a.state)),
    };
  });
  const clusters = r.frames.flatMap((f) => f.clusters);
  const feet = new Map(),
    acquisitions = [],
    activation = [];
  for (const frame of r.frames) {
    for (const [actorId, c] of [
      [frame.groundContact?.actorId, frame.groundContact?.surfaceContact],
      [frame.strike?.actorId, frame.strike?.outcome === 'contact' ? frame.strike.contact : null],
      [frame.challenge?.actorId, frame.challenge?.physical?.contact],
    ])
      if (c?.available)
        feet.set(`${actorId}:${c.at}:${c.foot}:${hash(c.impulse)}`, { actorId, ...c });
  }
  for (let i = 1; i < r.frames.length; i++) {
    const a = r.frames[i - 1],
      b = r.frames[i];
    if (b.ownerId && b.ownerId !== a.ownerId) {
      const c = b.groundContact;
      const keeper =
        f.initial.players.find((p) => p.id === b.ownerId)?.slot.position === 'goalkeeper';
      const valid =
        keeper ||
        Boolean(
          c?.actorId === b.ownerId &&
            c.executed &&
            c.retained &&
            c.surfaceContact?.available &&
            c.at > a.time - 1e-9 &&
            c.at <= b.time + 1e-9,
        );
      acquisitions.push({
        at: b.time,
        ownerId: b.ownerId,
        valid,
        witness: c ?? null,
        keeper: Boolean(keeper),
      });
      assert.ok(valid, `${name}: unexplained acquisition`);
    }
  }
  for (const c of clusters) {
    assert.ok(c.energyAfter <= c.energyBefore + 1e-7, `${name}: passive cluster energy`);
    for (const axis of ['x', 'y'])
      assert.ok(
        Math.abs(c.momentumAfter[axis] - c.momentumBefore[axis] - c.boundaryImpulse[axis]) < 1e-7,
        `${name}: momentum + edge impulse`,
      );
    for (const j of c.impulses) {
      assert.ok(j.energyAfter <= j.energyBefore + 1e-7);
      for (const axis of ['x', 'y'])
        assert.ok(Math.abs(j.momentumAfter[axis] - j.momentumBefore[axis]) < 1e-7);
    }
  }
  // Combined configuration is tested on the same local initial states. This is
  // labelled local compatibility, never a complete autonomous match.
  if (['body-pass-third', 'pass-body-third', 'line-four', 'ball-touchline'].includes(name)) {
    const s = withHolisticDevelopment(f.initial);
    if (f.initial.pendingStrike)
      s.pendingStrike = globalThis.structuredClone(f.initial.pendingStrike);
    if (f.initial.defensiveChallenge)
      s.defensiveChallenge = globalThis.structuredClone(f.initial.defensiveChallenge);
    const combined = tracePr214(s, f.config.ticks),
      restored = tracePr214(normalizedPr213State(s), f.config.ticks);
    assert.deepEqual(json(combined.frames), json(restored.frames));
    const before = tracePr214(s, 3).state,
      after = tracePr214(before, 1).state;
    activation.push(...observeHolisticActivation(before, after));
    activation.push({
      combinedLocalTerminal: hash(normalizedPr213State(combined.state)),
      initial: normalizedPr213State(s),
      frames: combined.frames,
    });
  }
  const events = [
    ...clusters.flatMap((c) =>
      c.impulses
        .filter((j) => j.kind === 'impact')
        .map((j) => ({ at: j.at, kind: 'body', actors: j.participants })),
    ),
    ...[...feet.values()].map((c) => ({ at: c.at, kind: 'foot', actors: [c.actorId] })),
  ].sort((a, b) => a.at - b.at);
  const metrics = {
    clusters: clusters.length,
    impacts: clusters.flatMap((c) => c.impulses).filter((j) => j.kind === 'impact').length,
    maximumBodies: Math.max(0, ...clusters.map((c) => c.participants.length)),
    maximumIterations: Math.max(0, ...clusters.map((c) => c.iterations)),
    maximumEventsPerTick: Math.max(0, ...r.frames.map((f) => f.clusters.length)),
    maximumResidualClosingSpeed: Math.max(
      0,
      ...clusters.filter((c) => !c.unresolved).map((c) => c.residualClosingSpeed),
    ),
    maximumMomentumResidual: Math.max(
      0,
      ...clusters.map((c) =>
        Math.hypot(
          c.momentumAfter.x - c.momentumBefore.x - c.boundaryImpulse.x,
          c.momentumAfter.y - c.momentumBefore.y - c.boundaryImpulse.y,
        ),
      ),
    ),
    maximumPassiveEnergyIncrease: Math.max(
      0,
      ...clusters.map((c) => c.energyAfter - c.energyBefore),
    ),
    unresolved: [...new Set(clusters.filter((c) => c.unresolved).map((c) => c.reason))],
    footContacts: feet.size,
    unexplainedAcquisitions: acquisitions.filter((a) => !a.valid).length,
    controls: acquisitions.length,
    restarts: r.frames
      .filter((f, i) => i && f.restart?.id !== r.frames[i - 1].restart?.id && f.restart)
      .map((f) => f.restart),
  };
  return {
    name,
    initial: f.initial,
    frames: r.frames,
    events,
    feet: [...feet.values()],
    acquisitions,
    saves,
    activation,
    metrics,
    terminal: hash(normalizedPr213State(r.state)),
  };
});
const primary = rows.find((r) => r.name === 'body-pass-third');
const first = primary.events.filter((e) => e.kind === 'body').slice(0, 2);
assert.equal(first.length, 2);
assert.equal(Math.floor((first[0].at - 10) / 0.025), Math.floor((first[1].at - 10) / 0.025));
assert.equal(primary.frames.at(-1).strike.outcome, 'contact');
assert.ok(rows.find((r) => r.name === 'line-four').metrics.maximumBodies === 4);
assert.ok(
  rows.find((r) => r.name === 'over-bound-five').metrics.unresolved.includes('body_count_bound'),
);
assert.ok(
  rows.find((r) => r.name === 'clinch-third').metrics.unresolved.includes('initial_body_overlap'),
);
// Exact PR213 isolated reference in the CURRENT executor; original archive replay
// remains a separate unchanged-source CI check.
const old = createPr213Scene({
  name: 'body-pass-challenge',
  separation: 0.5,
  lateral: 0.3,
  defenderSpeed: -6,
}).initial;
const newer = {
  ...globalThis.structuredClone(old),
  experimentalPlayerBodyImpulse: 'upright-cluster-dev-v1',
};
const a = tracePr213(old, 8),
  b = tracePr214(newer, 8);
assert.deepEqual(a.state.lastStrikeResolution?.contact, b.state.lastStrikeResolution?.contact);
assert.deepEqual(
  a.frames
    .flatMap((f) => f.playerContacts)
    .filter((c) => c.kind === 'impact')
    .map((c) => [
      c.at,
      c.normalImpulse,
      Object.fromEntries(
        c.participants
          .map((id, i) => [id, c.after[i]])
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    ]),
  b.frames
    .flatMap((f) => f.playerContacts)
    .filter((c) => c.kind === 'impact')
    .map((c) => [
      c.at,
      c.normalImpulse,
      Object.fromEntries(
        c.participants
          .map((id, i) => [id, c.after[i]])
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
    ]),
);
const reference = {
  initial: old,
  oldFrames: a.frames,
  newFrames: b.frames,
  passContact: a.state.lastStrikeResolution.contact,
};
const profileFingerprints = Object.fromEntries(
  integrationProfileIdSchema.options.map((id) => [
    id,
    resolveIntegrationProfile(id, 'state-value-v1').fingerprint,
  ]),
);
const development = readDevelopmentInput('sw', 'state-value-v1');
const initial = withHolisticDevelopment(development.input);
initial.seed = 'pr215-holistic-sw-B-v1';
initial.playerAgencyEnabled = false;
const baseline = withIntegrationProfile(
  globalThis.structuredClone(development.input),
  'realism-candidate-v1',
  'state-value-v1',
);
baseline.seed = initial.seed;
baseline.playerAgencyEnabled = false;
tacticalMatchStateSchema.parse(initial);
tacticalMatchStateSchema.parse(baseline);
assert.deepEqual(
  initial.players.map((p) => p.profile),
  baseline.players.map((p) => p.profile),
);
const protocol = {
  inputReference: development.path,
  inputReferenceHash: hash(development.input),
  recipe: holisticRecipe(),
  initial: normalizedPr213State(initial),
  initialHash: hash(normalizedPr213State(initial)),
  baseline: normalizedPr213State(baseline),
  baselineHash: hash(normalizedPr213State(baseline)),
  profileFingerprints,
  rosters: initial.players.map((p) => ({
    id: p.id,
    team: p.team,
    slot: p.slot,
    attributes: p.profile.attributes,
    weightKg: p.profile.weightKg,
  })),
  teams: initial.teams,
  source,
  dt: 0.025,
  readiness: 'BLOCKED_FOR_HOLISTIC_MATCH',
  blockers: [
    'upright-cluster-dev-v1 owns only pending/standing intervals; carry/loose/delivery body authority is not migrated',
    'the historical two-surface ball clinch interpenetrates the solid torso cores; approaching third-body coupling remains unresolved',
    'activation witnesses are incomplete for selected policy-specific consumers; unknown invocation remains null',
  ],
  smoke: 'NOT_RUN: mandatory physical/activation gates incomplete',
};
const inventory = holisticInventory();
const result = { source, rows, reference, inventory, protocol };
const pairCost = (selection) => {
  const fixtures = Array.from({ length: 64 }, () => ({
    ...globalThis.structuredClone(old),
    experimentalPlayerBodyImpulse: selection,
  }));
  const began = performance.now(),
    cpuBefore = process.cpuUsage();
  for (let i = 0; i < fixtures.length; i++)
    for (let tick = 0; tick < 8; tick++) fixtures[i] = stepTacticalMatch(fixtures[i], 0.025);
  return {
    wallSeconds: (performance.now() - began) / 1000,
    cpu: process.cpuUsage(cpuBefore),
    ticks: 512,
    maximumTacticalBytes: Math.max(
      ...fixtures.map((s) => Buffer.byteLength(JSON.stringify(normalizedPr213State(s)))),
    ),
  };
};
const matchedPairCost = {
  pair: pairCost('upright-pair-dev-v1'),
  cluster: pairCost('upright-cluster-dev-v1'),
  scope:
    '64 identical isolated-pair inputs x 8 canonical ticks; no evidence-frame observer, shared process RSS; not whole-match overhead',
};
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
  matchedPairCost,
};
if (check) {
  assert.deepEqual(json(result), read(`${ROOT}/canonical-${version}.json.gz`).result);
  console.log('PR214 exact-source canonical / configuration replay PASS');
} else {
  write(`${ROOT}/canonical-${version}.json.gz`, { result, costs });
  write(`${ROOT}/summary-${version}.json`, {
    source,
    rows: rows.map((r) => ({ name: r.name, events: r.events, ...r.metrics, saves: r.saves })),
    counts: inventory.counts,
    costs,
    readiness: protocol.readiness,
    blockers: protocol.blockers,
  });
  write(`${ROOT}/holistic-inventory-${version}.json`, inventory);
  write(`${ROOT}/holistic-input-${version}.json.gz`, protocol);
}
console.log(
  JSON.stringify({
    scenes: rows.length,
    reloads: rows.length * 4,
    counts: inventory.counts,
    costs,
    readiness: protocol.readiness,
  }),
);
