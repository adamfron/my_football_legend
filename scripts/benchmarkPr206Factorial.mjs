import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import { runEpisode, body, makeContract } from './pr206Episodes.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { applyCanonicalBallControl } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'factorial-v1';
assert.match(version, /^[a-z0-9-]+$/);
const qualification = JSON.parse(
  gunzipSync(
    readFileSync(
      `docs/performance/pr206/${args.get('qualification') ?? 'qualification-v1'}.json.gz`,
    ),
  ),
).result;
const open = qualification.rows.filter((r) => r.config.scenario === 'open');
assert.equal(open.length, 3);
assert.ok(
  open.every((r) => r.qualifies),
  'Gate A must pass first',
);
for (const r of open) {
  const ablation = qualification.rows.find(
    (a) => a.config.geometry === r.config.geometry && a.config.scenario === 'ablation',
  );
  const l = r.frames.find((f) => Math.abs(f.at - r.clocks.aRelease) < 1e-7),
    q = ablation.frames.find((f) => Math.abs(f.at - r.clocks.aRelease) < 1e-7);
  assert.ok(distance(l.position, q.position) > 0.1, 'Gate B must physically change body state');
}
const groups = [
  { id: 'LL', reading: 20, touch: 20 },
  { id: 'LH', reading: 20, touch: 85 },
  { id: 'HL', reading: 85, touch: 20 },
  { id: 'HH', reading: 85, touch: 85 },
];
const manifest = source(),
  started = performance.now(),
  cpu = process.cpuUsage(),
  rows = [],
  execution = [],
  mediation = [],
  rejected = [];
const families = ['long_ground', 'fast_ground', 'descending', 'moving', 'lateral', 'pressure'];
const scenarios = args.has('quick')
  ? [{ family: 'fast_ground', sample: 0, window: 'adequate' }]
  : families.flatMap((family) =>
      [0, 1].flatMap((sample) =>
        ['adequate', 'inadequate'].map((window) => ({ family, sample, window })),
      ),
    );

for (const spec of scenarios) {
  const config = {
    seed: `pr206-factorial-${spec.sample}`,
    geometry: spec.sample,
    family: spec.family,
    scenario: spec.window === 'adequate' ? 'open' : 'late',
    duration: spec.window === 'adequate' ? 2 : 1.8,
    controlledB: true,
  };
  const pre = groups.map((g) => ({
    group: g,
    ...runEpisode({ ...config, reading: g.reading, touch: g.touch }),
  }));
  const ref = pre.find((p) => p.group.id === 'HH'),
    b = ref.final.players.find((p) => p.id === ref.f.b.id),
    c = ref.final.players.find((p) => p.id === ref.f.c.id);
  if (ref.final.ball.ownerId !== b.id) {
    rejected.push({
      ...spec,
      reason: 'reference_B_has_no_real_control',
      preludes: pre.map((p) => ({ group: p.group.id, row: p.row })),
    });
    continue;
  }
  const action = {
    type: 'pass',
    actorId: b.id,
    receiverId: c.id,
    target: { x: c.position.x, y: c.position.y + (spec.family === 'lateral' ? 3 : 0) },
    intent:
      spec.family === 'fast_ground' ? 'direct' : spec.family === 'moving' ? 'lead' : 'support',
    delivery: spec.family === 'descending' ? 'lofted' : 'ground',
  };
  const launched = resolveMatchAction(
    globalThis.structuredClone(ref.final),
    action,
    'human_selected',
  );
  if (launched.lastPassDiagnostic?.passId === ref.final.lastPassDiagnostic?.passId) {
    rejected.push({
      ...spec,
      reason: 'real_B_action_did_not_release',
      action,
      preludes: pre.map((p) => ({ group: p.group.id, row: p.row })),
    });
    continue;
  }
  const contract = makeContract(ref.final, launched, c.id, launched.time + 8),
    releaseSample = sampleCanonicalOutcome(ref.final, launched, 'original-delivery-v3');
  const ballHash = hash(launched.ball),
    releaseHash = hash(launched),
    releaseDistance = distance(b.position, action.target);
  let checkpoint = null;
  for (const p of pre) {
    const s = globalThis.structuredClone(launched),
      actor = p.final.players.find((q) => q.id === c.id),
      old = s.players.findIndex((q) => q.id === c.id);
    s.players[old] = globalThis.structuredClone(actor);
    for (const key of ['memory', 'positions', 'plans']) {
      const from = p.final.activePerceptionRuntime?.[key]?.[c.id];
      if (from) s.activePerceptionRuntime[key][c.id] = globalThis.structuredClone(from);
      else delete s.activePerceptionRuntime[key][c.id];
    }
    const sensor = p.final.liveBallFlightRuntime?.sensors[c.id];
    if (sensor) s.liveBallFlightRuntime.sensors[c.id] = globalThis.structuredClone(sensor);
    else delete s.liveBallFlightRuntime.sensors[c.id];
    assert.equal(hash(s.ball), ballHash);
    // No collision state is cleared to make an arm eligible.
    const shortSamples = [releaseSample],
      events = [],
      actions = [],
      motor = [],
      bodies = [];
    let firstContact = null,
      contactState = null;
    globalThis.__pr206Command = (t) => {
      if (t.actorId === c.id) motor.push(t);
    };
    globalThis.__pr206ContactCheckpoint = (params) => {
      if (params[1] !== c.id || contactState) return;
      contactState = { state: params[0], cause: params[2], finiteGroundContact: params[3] };
    };
    const continued = continueRelease(
      { state: s, contract, releaseSample, ballHash },
      {},
      undefined,
      (before, after, fact) => {
        if (fact.at <= contract.releasedAt + 0.25 + 1e-8) shortSamples.push(fact);
        if (fact.contacts.length || fact.releaseContact)
          events.push({
            at: after.time,
            contacts: fact.contacts,
            releaseContact: fact.releaseContact ?? null,
            ground: after.lastGroundContact ?? null,
            body: after.lastBallContact ?? null,
          });
        const previous = before.players.find((q) => q.id === c.id),
          now = after.players.find((q) => q.id === c.id);
        if (fact.contacts.some((q) => q.actorId === c.id) && !firstContact)
          firstContact = {
            at: after.time,
            preTickBody: body(previous),
            postTickBody: body(now),
            preTickBall: before.ball,
            ground: after.lastGroundContact ?? null,
            continuous: before.continuousBodyContacts ?? [],
          };
        if (after.decisionIndex !== before.decisionIndex)
          actions.push({ at: after.time, action: after.currentAction });
        bodies.push({ at: after.time, ...body(now), ball: after.ball });
      },
    );
    delete globalThis.__pr206Command;
    delete globalThis.__pr206ContactCheckpoint;
    const eligibleFamily = spec.family !== 'descending';
    const contactExcluded = Boolean(
      firstContact &&
        ((firstContact.preTickBall.height ?? 0) > 0.65 ||
          firstContact.continuous.includes(c.id) ||
          !firstContact.ground?.executed ||
          firstContact.ground.actorId !== c.id ||
          Math.abs(firstContact.ground.at - firstContact.at) > 1e-7),
    );
    const row = {
      ...spec,
      group: p.group.id,
      reading: p.group.reading,
      touch: p.group.touch,
      releaseHash,
      ballHash,
      releaseDistance,
      launchBall: launched.ball,
      referenceAction: action,
      primary: eligibleFamily && !contactExcluded,
      exclusion: !eligibleFamily
        ? 'exploratory_aerial_not_validated'
        : contactExcluded
          ? 'unvalidated_contact_route'
          : null,
      prelude: p.row,
      injectedBody: body(actor),
      closestOtherBody: Math.min(
        ...s.players.filter((q) => q.id !== c.id).map((q) => distance(q.position, actor.position)),
      ),
      firstContact,
      exactContact: contactState
        ? {
            at: contactState.state.time,
            body: body(contactState.state.players.find((p) => p.id === c.id)),
            ball: contactState.state.ball,
            plan: contactState.state.activePerceptionRuntime?.plans[c.id] ?? null,
            job: contactState.state.activePerceptionRuntime?.positions[c.id] ?? null,
            continuous: contactState.state.continuousBodyContacts ?? [],
            finiteGroundContact: contactState.finiteGroundContact,
          }
        : null,
      events,
      actions,
      motor,
      bodies,
      outcome: continued.outcome,
      shortHorizonOutcome: interpretCanonicalOutcome(
        { ...contract, horizonAt: contract.releasedAt + 0.25 },
        shortSamples,
      ),
      diagnostic: continued.diagnostic,
      frames: continued.frames,
      startHash: continued.startHash,
      finalHash: continued.finalHash,
      saveBytes: Buffer.byteLength(JSON.stringify(continued.final)),
    };
    rows.push(row);
    if (
      !checkpoint &&
      contactState &&
      row.primary &&
      contactState.finiteGroundContact &&
      !(contactState.state.continuousBodyContacts ?? []).includes(c.id)
    )
      checkpoint = contactState;
  }
  const quartet = rows.slice(-4);
  if (quartet.some((r) => !r.primary))
    for (const row of quartet) {
      row.primary = false;
      row.exclusion ??= 'paired_peer_contact_scope';
    }
  // Matched physical nomination, no movement before execution. Contact is real
  // and reachable; the native completion still determines impulse and ownership.
  if (checkpoint) {
    const physical = globalThis.structuredClone(checkpoint.state),
      actor = physical.players.find((p) => p.id === c.id),
      baseBody = body(actor),
      baseBall = hash(physical.ball);
    const arms = [];
    for (const neutralReadiness of [false, true])
      for (const group of groups) {
        const s = globalThis.structuredClone(physical),
          p = s.players.find((p) => p.id === c.id);
        p.profile.attributes.gameReading = group.reading;
        p.profile.attributes.firstTouch = group.touch;
        assert.equal(hash(s.ball), baseBall);
        assert.deepEqual(body(p), baseBody);
        globalThis.__pr206NeutralReadiness = neutralReadiness;
        let after;
        try {
          after = applyCanonicalBallControl(s, c.id);
        } finally {
          delete globalThis.__pr206NeutralReadiness;
        }
        arms.push({
          group: group.id,
          neutralReadiness,
          body: body(p),
          ballHash: baseBall,
          ground: after.lastGroundContact ?? null,
          reception: after.lastReceptionOutcome ?? null,
          owner: after.ball.ownerId ?? null,
          outgoing: after.ball.velocity ?? null,
          afterHash: hash(after),
        });
      }
    execution.push({
      ...spec,
      checkpointHash: hash(physical),
      checkpoint: {
        at: physical.time,
        body: baseBody,
        ball: physical.ball,
        continuous: physical.continuousBodyContacts ?? [],
        cause: checkpoint.cause,
      },
      arms,
    });
  }
  // Predeclared mediation subset, chosen by family/sample/window, not outcomes.
  // Equal high reading, low touch, optical memory, target, ball and other bodies;
  // only C's actual physical prelude is exchanged. No preparation time is granted.
  if (
    spec.sample === 0 &&
    spec.window === 'adequate' &&
    ['fast_ground', 'lateral', 'pressure'].includes(spec.family)
  ) {
    const high = pre.find((p) => p.group.id === 'HL'),
      low = pre.find((p) => p.group.id === 'LL'),
      arms = [];
    for (const prepared of [false, true]) {
      const s = globalThis.structuredClone(launched),
        target = s.players.findIndex((p) => p.id === c.id);
      s.players[target] = globalThis.structuredClone(high.final.players.find((p) => p.id === c.id));
      const targetActor = s.players[target],
        from = (prepared ? high : low).final.players.find((p) => p.id === c.id);
      for (const key of [
        'position',
        'velocity',
        'facingAngle',
        'plantBalance',
        'lowerBodyPose',
        'verticalJump',
      ]) {
        if (from[key] !== undefined) targetActor[key] = globalThis.structuredClone(from[key]);
        else delete targetActor[key];
      }
      for (const key of ['memory', 'positions', 'plans']) {
        const value = high.final.activePerceptionRuntime?.[key]?.[c.id];
        if (value) s.activePerceptionRuntime[key][c.id] = globalThis.structuredClone(value);
        else delete s.activePerceptionRuntime[key][c.id];
      }
      const sensor = high.final.liveBallFlightRuntime?.sensors[c.id];
      if (sensor) s.liveBallFlightRuntime.sensors[c.id] = globalThis.structuredClone(sensor);
      else delete s.liveBallFlightRuntime.sensors[c.id];
      const result = continueRelease(
        { state: s, contract, releaseSample, ballHash },
        {},
        undefined,
      );
      arms.push({
        prepared,
        inputBody: body(targetActor),
        inputAttributes: targetActor.profile.attributes,
        ballHash,
        nonActorHash: hash({ ...s, players: s.players.filter((p) => p.id !== c.id) }),
        outcome: result.outcome,
        frames: result.frames,
        finalHash: result.finalHash,
      });
    }
    assert.equal(arms[0].nonActorHash, arms[1].nonActorHash);
    assert.deepEqual(arms[0].inputAttributes, arms[1].inputAttributes);
    mediation.push({ ...spec, arms });
  }
  console.log(
    JSON.stringify({
      progress: spec,
      rows: rows.length,
      execution: execution.length,
      rejected: rejected.length,
    }),
  );
}
assert.deepEqual(source(), manifest, 'Source changed during factorial');
const result = {
  classification:
    'development; controlled real B actions, frozen common releases and matched low-contact execution; not autonomous delivery effects',
  source: hash(manifest),
  qualificationHash: hash(qualification),
  groups,
  rows,
  execution,
  mediation,
  rejected,
};
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const output = `docs/performance/pr206/${version}.json.gz`;
if (args.has('check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).result), hash(result));
else {
  mkdirSync('docs/performance/pr206', { recursive: true });
  writeFileSync(output, gzipSync(JSON.stringify({ manifest, result, costs }), { level: 9 }), {
    flag: 'wx',
  });
}
console.log(
  JSON.stringify({
    output,
    costs,
    n: rows.length,
    matched: execution.length,
    rejected: rejected.map((r) => ({
      family: r.family,
      sample: r.sample,
      window: r.window,
      reason: r.reason,
    })),
    outcomes: rows.map((r) => ({
      family: r.family,
      sample: r.sample,
      window: r.window,
      group: r.group,
      primary: r.primary,
      touch: r.outcome.directReceiverTouch,
      control: r.outcome.receiverControl,
      retention: r.outcome.teamPossessionAtOneSecond,
      censored: r.outcome.censored,
    })),
  }),
);
