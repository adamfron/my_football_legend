import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { checkPr216Source, recordPr216Source, ROOT } from './pr216Evidence.mjs';
import { hash, write } from './pr199Evidence.mjs';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { createPr215ReceptionBlocker, createPr215LooseScene } from './pr215Scenarios.ts';
import { createPr214Scene } from './pr214Scenarios.ts';
import { withHolisticDevelopment } from './holisticDevelopment.ts';
import { stepStancePrototype, stepFallPrototype } from './pr216GaitPrototype.ts';
import {
  deriveLowerBodyGeometry,
  neutralLowerBodyPose,
} from '../src/core/matchSimulation/lowerBodyGeometry.ts';
const check = process.argv.includes('--check');
if (process.argv.includes('--record-source')) recordPr216Source();
const source = checkPr216Source();
const version = process.argv.find((x) => x.startsWith('--version='))?.split('=')[1] ?? 'final-v1';
assert.match(version, /^[a-z0-9-]+$/);
const json = (x) => JSON.parse(JSON.stringify(x));
const reload = (s) => tacticalMatchStateSchema.parse(json(s));
const begin = performance.now(),
  cpu = process.cpuUsage();
const old = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr215/browser/incident-native-replay.json.gz')),
);
const pair = ['footballer_pro_0_11', 'footballer_pro_1_12'];
const causal = old.history.map((f) => {
  const players = pair.map((id) => f.players.find((p) => p.id === id));
  return {
    time: f.time,
    players,
    separation:
      Math.hypot(
        players[0].position.x - players[1].position.x,
        players[0].position.y - players[1].position.y,
      ) - 0.68,
    ballOwner: f.ball.ownerId,
    ballTravel: f.ball.travelKind,
    contactOwnerActive: !!f.clusters?.length,
  };
});
const lastSeparated = causal.filter((f) => f.separation >= 0).at(-1),
  firstOverlap = causal.find((f) => f.separation < 0);
assert.ok(lastSeparated.time < 11.25 && firstOverlap.time < 11.275);
const trace = (initial, ticks) => {
  let s = reload(initial),
    maximumPenetration = 0,
    impacts = 0,
    supportSteps = 0,
    firstGroundContact;
  const checkpoints = [],
    events = [],
    strikes = [],
    window = [],
    liveness = [];
  let lastSample = s,
    ballTransport = 0;
  for (let i = 0; i < ticks; i++) {
    const previous = s;
    s = stepTacticalMatch(s, 0.025);
    if (!firstGroundContact && s.lastGroundContact?.at > initial.time)
      firstGroundContact = s.lastGroundContact;
    const strike = s.lastStrikeResolution;
    if (
      strike &&
      strike.at >= initial.time &&
      !strikes.some((r) => r.id === strike.id && r.at === strike.at && r.outcome === strike.outcome)
    )
      strikes.push(strike);
    ballTransport += Math.hypot(s.ball.x - previous.ball.x, s.ball.y - previous.ball.y);
    if ((i + 1) % 2400 === 0) {
      liveness.push({
        from: lastSample.time,
        to: s.time,
        decisions: s.decisionIndex - lastSample.decisionIndex,
        receptions:
          (s.executionWitnesses?.['controlled-reception']?.executed ?? 0) -
          (lastSample.executionWitnesses?.['controlled-reception']?.executed ?? 0),
        standingContacts:
          (s.executionWitnesses?.['standing-challenge']?.executed ?? 0) -
          (lastSample.executionWitnesses?.['standing-challenge']?.executed ?? 0),
        kicks:
          (s.executionWitnesses?.['prepared-kick']?.executed ?? 0) -
          (lastSample.executionWitnesses?.['prepared-kick']?.executed ?? 0),
        ballTransport,
        secondsSincePolicy: s.time - (s.executionWitnesses?.['policy-b']?.at ?? 0),
      });
      lastSample = s;
      ballTransport = 0;
    }
    if ((i + 1) % 2400 === 0) console.log('PR216 progress', ticks, i + 1, s.time);
    const clusters = s.multiBodyResolutions ?? [];
    for (const c of clusters) {
      maximumPenetration = Math.max(maximumPenetration, c.maximumPenetration);
      supportSteps += Number(c.impulses.some((x) => x.kind === 'support'));
      impacts += c.impulses.filter((x) => x.kind === 'impact').length;
      if (
        c.unresolved ||
        c.iterations > 32 ||
        c.participants.length === 5 ||
        c.impulses.some((x) => x.kind === 'impact')
      )
        events.push(c);
    }
    window.push({
      time: s.time,
      ball: s.ball,
      players: s.players.map((p) => ({
        id: p.id,
        position: p.position,
        velocity: p.velocity,
        plant: p.plantBalance,
      })),
      contacts: s.playerBodyContacts,
    });
    if (window.length > 80) window.shift();
    if (i === 0 || (i + 1) % 2400 === 0 || s.executionWitnesses?.unresolved) {
      let a = s,
        b = reload(s);
      for (let k = 0; k < 8; k++) {
        a = stepTacticalMatch(a, 0.025);
        b = stepTacticalMatch(b, 0.025);
        assert.deepEqual(reload(a), reload(b), 'exact native normal-schema saved continuation');
      }
      checkpoints.push({ tick: i + 1, state: reload(s), hash: hash(json(s)) });
    }
    if (s.executionWitnesses?.unresolved) break;
  }
  return {
    initial: reload(initial),
    terminal: reload(s),
    maximumPenetration,
    impacts,
    supportSteps,
    checkpoints,
    events,
    strikes,
    firstGroundContact,
    window,
    liveness,
  };
};
const locals = [
  ['reception', createPr215ReceptionBlocker(), 16],
  ['ordinary-contest', createPr215LooseScene(), 12],
];
for (const name of [
  'line-three',
  'line-four',
  'body-pass-third',
  'pass-body-third',
  'body-pass-challenge',
  'ball-touchline',
  'stationary-duel',
])
  locals.push([name, withHolisticDevelopment(createPr214Scene(name).initial), 12]);
const local = locals.map(([name, s, ticks]) => ({ name, ...trace(s, ticks) }));
const tangentInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/failure-keeper-cycle-v11.json.gz`)),
);
const tangentContinuation = trace(tangentInput.initial, check ? 400 : 800);
assert.equal(tangentContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(tangentContinuation.maximumPenetration <= 1e-7);
assert.ok(tangentContinuation.terminal.decisionIndex > tangentContinuation.initial.decisionIndex);
const entryInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/substitution-exception-v10.json.gz`)),
);
const entryContinuation = trace(entryInput.recent[0], check ? 800 : 1600);
assert.equal(entryContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(entryContinuation.terminal.substitutionState.completed.length >
  entryContinuation.initial.substitutionState.completed.length);
assert.ok(entryContinuation.impacts > 0);
assert.ok(entryContinuation.terminal.decisionIndex > entryContinuation.initial.decisionIndex);
const reboundInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/rebound-entry-origin-v8.json.gz`)),
);
const reboundContinuation = trace(reboundInput.initial, check ? 400 : 800);
assert.equal(reboundContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(reboundContinuation.firstGroundContact?.at > reboundContinuation.initial.time);
assert.ok(reboundContinuation.firstGroundContact?.at < 1349.15);
assert.ok(reboundContinuation.terminal.decisionIndex > reboundContinuation.initial.decisionIndex);
const keeperFootInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/keeper-foot-entry-origin-v6.json.gz`)),
);
const keeperFootContinuation = trace(keeperFootInput.initial, check ? 400 : 800);
assert.equal(keeperFootContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(keeperFootContinuation.terminal.decisionIndex > keeperFootContinuation.initial.decisionIndex);
assert.ok(keeperFootContinuation.terminal.time > 5233.5);
const remainderInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/body-overlap-first-entry-keeper-v5.json.gz`)),
);
const remainderContinuation = trace(remainderInput.initial, check ? 400 : 800);
assert.equal(remainderContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(remainderContinuation.maximumPenetration <= 1e-7);
assert.ok(remainderContinuation.terminal.decisionIndex > remainderContinuation.initial.decisionIndex);
const searchInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/search-bound-origin-keeper-v4.json.gz`)),
);
const searchContinuation = trace(searchInput.initial, check ? 400 : 800);
assert.equal(searchContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(searchContinuation.terminal.decisionIndex > searchContinuation.initial.decisionIndex);
assert.ok(searchContinuation.firstGroundContact?.at > searchContinuation.initial.time);
const keeperInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/next-keeper-zone-starvation-release-v2.json.gz`)),
);
const keeperContinuations = ['terminal'].map((key) => ({
  key,
  ...trace(keeperInput[key], check ? 400 : 2400),
}));
for (const r of keeperContinuations) {
  assert.equal(r.terminal.executionWitnesses?.unresolved, undefined);
  assert.ok(r.firstGroundContact?.executed && r.firstGroundContact.surfaceContact?.available);
  assert.ok(r.firstGroundContact.at > r.initial.time && r.firstGroundContact.at < r.initial.time + 0.5);
  assert.ok(r.terminal.decisionIndex > r.initial.decisionIndex);
}
const heldInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/restart-overlap-origin-keeper-v1.json.gz`)),
);
const heldContinuation = trace(heldInput.initial, check ? 400 : 800);
assert.equal(heldContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(heldContinuation.impacts > 0, 'real braking impact in held substitution interval');
assert.ok(heldContinuation.maximumPenetration <= 1e-7);
assert.ok(heldContinuation.terminal.time > 2140.425);
const releasedInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/release-foot-entry-origin-keeper-v3.json.gz`)),
);
const releasedContinuation = trace(releasedInput.initial, check ? 400 : 800);
assert.equal(releasedContinuation.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(releasedContinuation.firstGroundContact?.surfaceContact?.available);
assert.ok(releasedContinuation.firstGroundContact.at < 4843.075);
assert.notEqual(releasedContinuation.firstGroundContact.actorId, releasedInput.initial.throwInRestriction.throwerId);
assert.ok(releasedContinuation.terminal.decisionIndex > releasedContinuation.initial.decisionIndex);
const releaseInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/next-release-handoff-blocker-five-v2.json.gz`)),
);
const releaseContinuation = trace(
  releaseInput.recent.find((s) => s.time > 946.02 && s.time < 946.03),
  check ? 400 : 800,
);
assert.equal(
  releaseContinuation.terminal.executionWitnesses?.unresolved,
  undefined,
  'bouncing pass release continuation',
);
const releaseSelection = releaseContinuation.checkpoints[0].state.pendingStrike;
assert.ok(releaseSelection, 'a real pending intention replaces the historical release');
assert.ok(
  releaseContinuation.checkpoints[0].state.ball.height > 0.24,
  'selection preserves the actual incoming height',
);
assert.equal(releaseContinuation.checkpoints[0].state.ball.travelKind, undefined);
const releaseContact = releaseContinuation.strikes.find(
  (s) => s.id === releaseSelection.id && s.outcome === 'contact',
);
assert.ok(releaseContact?.contact?.available, 'actual foot contact before release');
assert.ok(
  releaseContact.at > releaseSelection.selectedAt && releaseContact.at < releaseSelection.expiresAt,
);
assert.ok(
  releaseContact.contact.point.z <= 0.24,
  'the physical low strike capability is not enlarged',
);
assert.ok(releaseContinuation.terminal.decisionIndex > releaseContinuation.initial.decisionIndex);
const convergenceInput = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/release-convergence-input-v1.json.gz`)),
);
const convergenceContinuation = trace(convergenceInput.initial, check ? 400 : 800);
assert.equal(convergenceContinuation.terminal.executionWitnesses?.unresolved, undefined);
const completedBoundary = convergenceContinuation.events.find(
  (c) => c.participants.length === 3 && c.iterations > 32,
);
assert.ok(completedBoundary, 'bounded completion of the recorded three-body boundary constraint');
assert.ok(completedBoundary.residualClosingSpeed <= 1e-4);
assert.ok(completedBoundary.maximumPenetration <= 1e-7);
assert.ok(completedBoundary.energyAfter <= completedBoundary.energyBefore + 1e-7);
assert.ok(
  convergenceContinuation.terminal.decisionIndex > convergenceContinuation.initial.decisionIndex,
);
const fiveInput = JSON.parse(gunzipSync(readFileSync(`${ROOT}/five-body-incident-input.json.gz`)));
const fiveContinuation = trace(fiveInput.initial, 2400);
assert.equal(
  fiveContinuation.terminal.executionWitnesses?.unresolved,
  undefined,
  'five-body canonical continuation',
);
assert.ok(
  fiveContinuation.terminal.decisionIndex > fiveContinuation.initial.decisionIndex,
  'onward decisions after fifth body',
);
assert.ok(
  fiveContinuation.events.some((c) => c.participants.length === 5 && !c.unresolved),
  'actual five-body solve',
);
for (const c of fiveContinuation.events) {
  assert.ok(c.maximumPenetration <= 1e-7);
  assert.ok(c.residualClosingSpeed <= 1e-4);
  assert.ok(c.energyAfter <= c.energyBefore + 1e-7);
  for (const axis of ['x', 'y'])
    assert.ok(
      Math.abs(c.momentumAfter[axis] - c.momentumBefore[axis] - c.boundaryImpulse[axis]) < 1e-7,
    );
}
assert.equal(local[0].terminal.executionWitnesses?.unresolved, undefined, 'reception remainder');
assert.equal(local[0].terminal.executionWitnesses?.['controlled-reception']?.executed, 1);
const match = trace(old.initial, check ? 2400 : 24000);
assert.equal(
  match.terminal.executionWitnesses?.unresolved,
  undefined,
  'continuous normal-team smoke',
);
assert.ok(match.terminal.time > 59 && match.impacts > 0);
assert.ok(match.maximumPenetration <= 0.002, 'unchanged penetration correction bound');
for (const minute of match.liveness) {
  assert.ok(
    minute.decisions > 0 &&
      minute.receptions + minute.standingContacts + minute.kicks > 0 &&
      minute.ballTransport > 1,
    `real football in every minute: ${JSON.stringify(minute)}`,
  );
  assert.ok(minute.secondsSincePolicy < 60, 'policy B cannot silently starve');
}
const formerDeadlock = JSON.parse(gunzipSync(readFileSync(`${ROOT}/canonical-final-v2.json.gz`)))
  .match.terminal;
const reaching = trace(formerDeadlock, 400);
assert.equal(reaching.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(reaching.terminal.decisionIndex > formerDeadlock.decisionIndex);
assert.ok(reaching.terminal.lastGroundContact.at > formerDeadlock.time);
assert.ok(
  Math.hypot(
    reaching.terminal.ball.x - formerDeadlock.ball.x,
    reaching.terminal.ball.y - formerDeadlock.ball.y,
  ) > 0.5,
);
const frozenInput = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr214/holistic-input-ci-v1.json.gz')),
);
const settledRebound = trace(
  JSON.parse(gunzipSync(readFileSync(`${ROOT}/p1-settled-rebound-input.json.gz`))),
  400,
);
assert.equal(settledRebound.terminal.executionWitnesses?.unresolved, undefined);
assert.ok(
  settledRebound.terminal.decisionIndex > settledRebound.initial.decisionIndex,
  'settled rebound onward decisions',
);
assert.equal(hash(reload(frozenInput.initial)), frozenInput.initialHash);
const frozenSmoke = trace({ ...frozenInput.initial, executionWitnesses: {} }, check ? 4800 : 24000);
assert.equal(
  frozenSmoke.terminal.executionWitnesses?.unresolved,
  undefined,
  'frozen 22-player smoke',
);
for (const minute of frozenSmoke.liveness)
  assert.ok(
    minute.decisions > 0 &&
      minute.receptions + minute.standingContacts + minute.kicks > 0 &&
      minute.ballTransport > 1,
    `frozen liveness ${JSON.stringify(minute)}`,
  );
const actor = {
  ...old.initial.players.find((p) => p.slot.position !== 'goalkeeper'),
  position: { x: 50, y: 34 },
  velocity: { x: 0, y: 0 },
  facingAngle: 0,
  lowerBodyPose: neutralLowerBodyPose(),
};
const nominal = deriveLowerBodyGeometry(actor);
const audit = {
  bodyTranslation: 0.5,
  footTranslation:
    deriveLowerBodyGeometry({ ...actor, position: { x: 50.5, y: 34 } }).left.foot.x -
    nominal.left.foot.x,
  support: 'nominal flags do not anchor world feet',
};
const gait = [];
for (const [name, target, speed, initialVelocity] of [
  ['acceleration', { x: 50, y: 60 }, 7, { x: 0, y: 0 }],
  ['sprint', { x: 50, y: 60 }, 8, { x: 0, y: 7 }],
  ['braking', { x: 50, y: 34 }, 0, { x: 0, y: 7 }],
  ['turn90', { x: 70, y: 34 }, 7, { x: 0, y: 7 }],
  ['reverse180', { x: 50, y: 10 }, 7, { x: 0, y: 7 }],
  ['shuffle', { x: 70, y: 34 }, 2, { x: 0, y: 0 }],
  ['backpedal', { x: 50, y: 10 }, 2, { x: 0, y: 0 }],
  ['pass-support', { x: 50, y: 34 }, 0, { x: 0, y: 0 }],
  ['shot-support', { x: 50, y: 34 }, 0, { x: 0, y: 0 }],
  ['one-leg-impact', { x: 50, y: 60 }, 4, { x: 3, y: 0 }],
])
  for (const mu of [1, 0.25]) {
    let p = { ...actor, velocity: initialVelocity },
      stance = {
        surface: 'firm-grass-dev-v1',
        foot: 'left',
        anchor: { x: nominal.left.foot.x, y: nominal.left.foot.y },
        swing: { x: nominal.right.foot.x, y: nominal.right.foot.y },
        elapsed: 0,
        steps: 0,
      };
    let slip = 0,
      peakForce = 0,
      peakAcceleration = 0,
      unsupported = false;
    for (let i = 0; i < 80; i++) {
      const r = stepStancePrototype(p, stance, target, speed, 0.025, mu);
      peakForce = Math.max(peakForce, r.requestedForce);
      peakAcceleration = Math.max(
        peakAcceleration,
        Math.hypot(r.player.velocity.x - p.velocity.x, r.player.velocity.y - p.velocity.y) / 0.025,
      );
      slip += Math.hypot(r.slip.x, r.slip.y);
      p = r.player;
      stance = r.stance;
      unsupported ||= r.unsupported;
      if (r.unsupported) break;
    }
    gait.push({
      name,
      mu,
      slip,
      peakForce,
      peakAcceleration,
      steps: stance.steps,
      unsupported,
      bodyTransport: Math.hypot(p.position.x - actor.position.x, p.position.y - actor.position.y),
      scope:
        'isolated canonical motor/traction/IK; pass/shot labels are stance loading objectives, not executed kicks',
    });
  }
const falls = [];
for (const impulse of [0, 8, 100]) {
  let s = { angle: 0, omega: 0, x: 0, z: 0.9, vx: 0, vz: 0, phase: 'supported' };
  const frames = [];
  for (let i = 0; i < 160; i++) {
    s = stepFallPrototype(s, actor.profile.weightKg, 0.025, i === 0 ? impulse : 0);
    frames.push(s);
  }
  falls.push({ impulse, frames });
}
assert.equal(falls[0].frames.at(-1).phase, 'supported');
assert.equal(falls[2].frames.at(-1).phase, 'grounded');
const summary = {
  source: source.fingerprint,
  tangentSupport: {
    previousSource: tangentInput.source,
    inputHash: hash(tangentContinuation.initial),
    from: tangentContinuation.initial.time,
    to: tangentContinuation.terminal.time,
    maximumPenetration: tangentContinuation.maximumPenetration,
    decisions: tangentContinuation.terminal.decisionIndex - tangentContinuation.initial.decisionIndex,
  },
  substitutionEntry: {
    previousSource: entryInput.source,
    inputHash: hash(entryContinuation.initial),
    from: entryContinuation.initial.time,
    to: entryContinuation.terminal.time,
    completedSubstitutions: entryContinuation.terminal.substitutionState.completed.length,
    impacts: entryContinuation.impacts,
    maximumPenetration: entryContinuation.maximumPenetration,
    decisions: entryContinuation.terminal.decisionIndex - entryContinuation.initial.decisionIndex,
  },
  reboundHandoff: {
    previousSource: reboundInput.source,
    inputHash: hash(reboundContinuation.initial),
    from: reboundContinuation.initial.time,
    to: reboundContinuation.terminal.time,
    firstGroundContact: reboundContinuation.firstGroundContact,
    decisions: reboundContinuation.terminal.decisionIndex - reboundContinuation.initial.decisionIndex,
  },
  keeperFoot: {
    previousSource: keeperFootInput.source,
    inputHash: hash(keeperFootContinuation.initial),
    from: keeperFootContinuation.initial.time,
    to: keeperFootContinuation.terminal.time,
    firstGroundContact: keeperFootContinuation.firstGroundContact,
    decisions: keeperFootContinuation.terminal.decisionIndex - keeperFootContinuation.initial.decisionIndex,
  },
  receptionRemainder: {
    previousSource: remainderInput.source,
    inputHash: hash(remainderContinuation.initial),
    from: remainderContinuation.initial.time,
    to: remainderContinuation.terminal.time,
    maximumPenetration: remainderContinuation.maximumPenetration,
    firstGroundContact: remainderContinuation.firstGroundContact,
    decisions: remainderContinuation.terminal.decisionIndex - remainderContinuation.initial.decisionIndex,
  },
  preparationSearch: {
    previousSource: searchInput.source,
    inputHash: hash(searchContinuation.initial),
    from: searchContinuation.initial.time,
    to: searchContinuation.terminal.time,
    firstGroundContact: searchContinuation.firstGroundContact,
    decisions: searchContinuation.terminal.decisionIndex - searchContinuation.initial.decisionIndex,
  },
  releasedRestart: {
    previousSource: releasedInput.source,
    inputHash: hash(releasedContinuation.initial),
    from: releasedContinuation.initial.time,
    to: releasedContinuation.terminal.time,
    firstGroundContact: releasedContinuation.firstGroundContact,
    decisions: releasedContinuation.terminal.decisionIndex - releasedContinuation.initial.decisionIndex,
  },
  heldInterval: {
    previousSource: heldInput.source,
    inputHash: hash(heldContinuation.initial),
    from: heldContinuation.initial.time,
    to: heldContinuation.terminal.time,
    impacts: heldContinuation.impacts,
    maximumPenetration: heldContinuation.maximumPenetration,
    completedSubstitutions: heldContinuation.terminal.substitutionState.completed.length,
  },
  keeperZone: keeperContinuations.map((r) => ({
    key: r.key,
    previousSource: keeperInput.source,
    inputHash: hash(r.initial),
    from: r.initial.time,
    to: r.terminal.time,
    firstGroundContact: r.firstGroundContact,
    decisions: r.terminal.decisionIndex - r.initial.decisionIndex,
  })),
  boundaryCompletion: {
    inputHash: hash(convergenceContinuation.initial),
    previousSource: convergenceInput.source,
    from: convergenceContinuation.initial.time,
    to: convergenceContinuation.terminal.time,
    decisions:
      convergenceContinuation.terminal.decisionIndex - convergenceContinuation.initial.decisionIndex,
    evidence: completedBoundary,
  },
  releaseHandoff: {
    inputHash: hash(releaseContinuation.initial),
    previousSource: releaseInput.source,
    from: releaseContinuation.initial.time,
    to: releaseContinuation.terminal.time,
    selectedAt: releaseSelection.selectedAt,
    contactAt: releaseContact.at,
    contact: releaseContact.contact,
    decisions:
      releaseContinuation.terminal.decisionIndex - releaseContinuation.initial.decisionIndex,
  },
  fiveBody: {
    inputHash: hash(reload(fiveInput.initial)),
    previousSource: fiveInput.source,
    from: fiveContinuation.initial.time,
    to: fiveContinuation.terminal.time,
    decisions: fiveContinuation.terminal.decisionIndex - fiveContinuation.initial.decisionIndex,
    solves: fiveContinuation.events.filter((c) => c.participants.length === 5).length,
    maximumPenetration: fiveContinuation.maximumPenetration,
  },
  lastSeparated,
  firstOverlap,
  local: local.map((r) => ({
    name: r.name,
    unresolved: r.terminal.executionWitnesses?.unresolved ?? null,
    impacts: r.impacts,
    maximumPenetration: r.maximumPenetration,
  })),
  match: {
    seconds: match.terminal.time,
    impacts: match.impacts,
    supportSteps: match.supportSteps,
    maximumPenetration: match.maximumPenetration,
    savedComparisons: match.checkpoints.length * 8,
    witnesses: match.terminal.executionWitnesses,
    liveness: match.liveness,
  },
  reaching: {
    from: formerDeadlock.time,
    to: reaching.terminal.time,
    decisions: reaching.terminal.decisionIndex - formerDeadlock.decisionIndex,
    lastContact: reaching.terminal.lastGroundContact.at,
  },
  frozenSmoke: {
    seconds: frozenSmoke.terminal.time,
    decisions: frozenSmoke.terminal.decisionIndex - frozenSmoke.initial.decisionIndex,
    liveness: frozenSmoke.liveness,
    witnesses: frozenSmoke.terminal.executionWitnesses,
  },
  audit,
  gait,
  falls: falls.map((r) => ({ impulse: r.impulse, terminal: r.frames.at(-1) })),
  cost: {
    wallSeconds: (performance.now() - begin) / 1000,
    cpu: process.cpuUsage(cpu),
    peakRSSKiB: process.resourceUsage().maxRSS,
  },
  promotion: 'RETAIN_EXPERIMENTAL',
  physicalProgressOnly: false,
  mandatoryP1:
    'PASS: finite loose-ball reaching, actual contacts and onward decisions; rolling normal-team liveness',
  lastPolicyDecisionAt: match.terminal.executionWitnesses?.['policy-b']?.at ?? null,
  secondsSincePolicyDecision:
    match.terminal.time - (match.terminal.executionWitnesses?.['policy-b']?.at ?? 0),
  fullMatchReadiness: 'SMOKE_PASS_FULL_MATCH_REPORTED_SEPARATELY',
  fallingProduction: false,
  stanceProduction: false,
};
if (!check) {
  write(`${ROOT}/canonical-${version}.json.gz`, {
    source: source.fingerprint,
    local,
    tangentContinuation,
    entryContinuation,
    reboundContinuation,
    keeperFootContinuation,
    remainderContinuation,
    searchContinuation,
    keeperContinuations,
    heldContinuation,
    releasedContinuation,
    releaseContinuation,
    convergenceContinuation,
    fiveContinuation,
    match,
    reaching,
    settledRebound,
    frozenSmoke,
    causal,
    falls,
    summary,
  });
  write(`${ROOT}/summary-${version}.json`, summary);
}
console.log(JSON.stringify(summary, null, 2));
