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
    supportSteps = 0;
  const checkpoints = [],
    events = [],
    window = [];
  for (let i = 0; i < ticks; i++) {
    s = stepTacticalMatch(s, 0.025);
    if ((i + 1) % 2400 === 0) console.log('PR216 progress', ticks, i + 1, s.time);
    const clusters = s.multiBodyResolutions ?? [];
    for (const c of clusters) {
      maximumPenetration = Math.max(maximumPenetration, c.maximumPenetration);
      supportSteps += Number(c.impulses.some((x) => x.kind === 'support'));
      impacts += c.impulses.filter((x) => x.kind === 'impact').length;
      if (c.unresolved || c.impulses.some((x) => x.kind === 'impact')) events.push(c);
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
    window,
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
  physicalProgressOnly: true,
  mandatoryP1:
    'NOT_COMPLETE: inspect normal-team action starvation; clock progression alone is not match continuity',
  lastPolicyDecisionAt: match.terminal.executionWitnesses?.['policy-b']?.at ?? null,
  secondsSincePolicyDecision:
    match.terminal.time - (match.terminal.executionWitnesses?.['policy-b']?.at ?? 0),
  fullMatchReadiness: 'BLOCKED_BY_LIVENESS_AND_REMAINING_COVERAGE',
  fallingProduction: false,
  stanceProduction: false,
};
if (!check) {
  write(`${ROOT}/canonical-${version}.json.gz`, {
    source: source.fingerprint,
    local,
    match,
    causal,
    falls,
    summary,
  });
  write(`${ROOT}/summary-${version}.json`, summary);
}
console.log(JSON.stringify(summary, null, 2));
