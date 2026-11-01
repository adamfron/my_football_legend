import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import {
  createPr213Scene,
  tracePr213,
  pr213Cases,
  pr213DuelScenes,
  normalizedPr213State,
} from './pr213Scenarios.ts';
import {
  resolvePlayerBodyImpulse,
  findPlayerBodyContact,
  retainPlayerBodyContacts,
} from '../src/core/matchSimulation/playerBodyContact.ts';
import { integrateCanonicalMovement } from '../src/core/matchSimulation/canonicalMovement.ts';
import {
  supportContinuousBodyContacts,
  ballBodyClearance,
} from '../src/core/matchSimulation/ballContactResolution.ts';
import { executeFootContact } from '../src/core/matchSimulation/footContact.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { ROOT, hash, write, read, recordPr213Source, checkPr213Source } from './pr213Evidence.mjs';
const check = process.argv.includes('--check');
const version = process.argv.find((a) => a.startsWith('--version='))?.split('=')[1] ?? 'final-v5';
if (process.argv.includes('--record-source')) recordPr213Source();
const source = checkPr213Source();
const started = performance.now(),
  cpu = process.cpuUsage();
const json = (x) => JSON.parse(JSON.stringify(x));
const fixtures = [...pr213Cases.map(createPr213Scene), ...pr213DuelScenes()];
const rows = fixtures.map((f) => {
  const r = tracePr213(f.initial, f.config.ticks);
  const saves = [0, 2, 4].map((ticks) => {
    const checkpoint = tracePr213(f.initial, ticks).state;
    const restored = normalizedPr213State(checkpoint);
    const a = tracePr213(checkpoint, 8),
      b = tracePr213(restored, 8);
    assert.deepEqual(json(a.frames), json(b.frames), `${f.config.name}: save frames`);
    assert.deepEqual(json(normalizedPr213State(a.state)), json(normalizedPr213State(b.state)));
    return {
      ticks,
      persistentPairAndPending: Boolean(
        checkpoint.pendingStrike && checkpoint.continuousPlayerContacts?.length,
      ),
      bytes: Buffer.byteLength(JSON.stringify(checkpoint)),
      terminal: hash(normalizedPr213State(a.state)),
    };
  });
  const feet = new Map(),
    passive = new Map(),
    bodies = [],
    acquisitions = [],
    rearming = [];
  let ownerChanges = 0,
    looseSeconds = 0,
    displacement = 0,
    lastOwner = f.initial.ball.ownerId;
  for (let i = 0; i < r.frames.length; i++) {
    const a = r.frames[i],
      previous = r.frames[i - 1];
    bodies.push(...a.playerContacts);
    for (const [actorId, c] of [
      [a.groundContact?.actorId, a.groundContact?.surfaceContact],
      [a.strike?.actorId, a.strike?.outcome === 'contact' ? a.strike.contact : undefined],
      [a.challenge?.actorId, a.challenge?.physical?.contact],
    ]) {
      if (c?.available)
        feet.set(`${actorId}:${c.at}:${c.foot}:${hash(c.impulse)}`, { actorId, ...c });
    }
    if (a.bodyContact)
      passive.set(
        `${a.bodyContact.at}:${a.bodyContact.playerId}:${a.bodyContact.kind}`,
        a.bodyContact,
      );
    if (!previous) continue;
    if (a.ownerId && a.ownerId !== previous.ownerId) {
      const witness = a.groundContact;
      const keeper =
        r.state.players.find((p) => p.id === a.ownerId)?.slot.position === 'goalkeeper';
      const valid =
        keeper ||
        Boolean(
          witness?.actorId === a.ownerId &&
            witness.executed &&
            witness.retained &&
            witness.surfaceContact?.available &&
            witness.at > previous.time - 1e-9 &&
            witness.at <= a.time + 1e-9,
        );
      acquisitions.push({ at: a.time, ownerId: a.ownerId, valid, witness });
      assert.ok(valid, `${f.config.name}: new owner without real control at ${a.time}`);
      if (lastOwner && lastOwner !== a.ownerId) ownerChanges++;
      lastOwner = a.ownerId;
    }
    if (!a.ownerId) looseSeconds += a.time - previous.time;
    displacement += Math.hypot(a.ball.x - previous.ball.x, a.ball.y - previous.ball.y);
    for (const pair of previous.continuousPlayers)
      if (
        !a.continuousPlayers.some(
          (p) => JSON.stringify(p.participants) === JSON.stringify(pair.participants),
        )
      )
        rearming.push({ at: a.time, participants: pair.participants });
  }
  for (const c of bodies.filter((c) => ['impact', 'support'].includes(c.kind))) {
    assert.ok(c.energyAfter <= c.energyBefore + 1e-7);
    for (const axis of ['x', 'y'])
      assert.ok(Math.abs(c.momentumAfter[axis] - c.momentumBefore[axis]) < 1e-7);
  }
  return {
    name: f.config.name,
    config: f.config,
    initial: f.initial,
    frames: r.frames,
    saves,
    contacts: [...feet.values()],
    passive: [...passive.values()],
    bodies,
    acquisitions,
    rearming,
    metrics: {
      footContacts: feet.size,
      passiveContacts: passive.size,
      impacts: bodies.filter((c) => c.kind === 'impact').length,
      supportImpulses: bodies.filter((c) => c.kind === 'support' && c.normalImpulse > 0).length,
      unresolvedBodies: bodies.filter((c) => c.kind === 'unresolved').length,
      ownerChanges,
      controlEvents: acquisitions.length,
      unexplainedAcquisitions: acquisitions.filter((a) => !a.valid).length,
      looseSeconds,
      displacement,
      bodyRearmings: rearming.length,
    },
    terminal: hash(normalizedPr213State(r.state)),
  };
});
const actorState = createPr213Scene({ name: 'mechanics' }).initial;
const a0 = actorState.players.find((p) => p.id === actorState.defensiveChallenge.actorId);
const b0 = actorState.players.find((p) => p.id === actorState.defensiveChallenge.opponentId);
const mechanics = [];
for (const [name, masses, velocities] of [
  [
    'symmetric',
    [75, 75],
    [
      { x: 3, y: 0 },
      { x: -3, y: 0 },
    ],
  ],
  [
    'unequal',
    [55, 110],
    [
      { x: 3, y: 0 },
      { x: -3, y: 0 },
    ],
  ],
  [
    'glancing',
    [75, 75],
    [
      { x: 3, y: 2 },
      { x: -3, y: -1 },
    ],
  ],
  [
    'similarly-moving',
    [75, 75],
    [
      { x: 3, y: 0 },
      { x: 2.9, y: 0 },
    ],
  ],
  [
    'separating',
    [75, 75],
    [
      { x: -3, y: 0 },
      { x: 3, y: 0 },
    ],
  ],
  [
    'resting',
    [75, 75],
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
  ],
])
  for (const restitution of [0, 0.05, 0.15, 0.3]) {
    const a = {
      ...a0,
      profile: { ...a0.profile, weightKg: masses[0] },
      position: { x: 30, y: 30 },
      velocity: velocities[0],
    };
    const b = {
      ...b0,
      profile: { ...b0.profile, weightKg: masses[1] },
      position: { x: 30.68, y: 30 },
      velocity: velocities[1],
    };
    const r = resolvePlayerBodyImpulse(a, b, 10, false, restitution);
    const again = resolvePlayerBodyImpulse(...r.players, 10.025, true, restitution);
    assert.ok(r.evidence.energyAfter <= r.evidence.energyBefore + 1e-8);
    assert.equal(again.evidence.normalImpulse, 0);
    mechanics.push({ name, restitution, contact: r.evidence, persistent: again.evidence });
  }
const balance = [
  ['gentle', 0.3, 'both', 0],
  ['strong', 6, 'both', 0],
  ['one-legged', 6, 'left', 0],
  ['turning', 4, 'right', Math.PI / 2],
  ['recovering', 2, 'both', 0],
  ['severe-upright-limit', 10, 'left', Math.PI],
].map(([name, speed, support, turn]) => {
  const a = {
    ...a0,
    position: { x: 30, y: 30 },
    velocity: { x: speed, y: 0 },
    plantBalance: { balance: 1, load: 0, support },
  };
  const b = { ...b0, position: { x: 30.68, y: 30 }, velocity: { x: 0, y: 0 } };
  const hit = resolvePlayerBodyImpulse(a, b, 10);
  let p = hit.players[0];
  const frames = [];
  for (let i = 0; i < 80; i++) {
    const body = integrateCanonicalMovement(p, {
      target: { x: 30 + Math.cos(turn) * 5, y: 30 + Math.sin(turn) * 5 },
      targetSpeed: i < 8 ? 3 : 0,
      desiredFacingAngle: p.facingAngle + turn,
      dt: 0.025,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    });
    p = { ...p, ...body };
    frames.push({
      at: 10 + (i + 1) * 0.025,
      position: p.position,
      velocity: p.velocity,
      plantBalance: p.plantBalance,
    });
  }
  return {
    name,
    contact: hit.evidence,
    frames,
    fallsSupported: false,
    newInjuryProbability: false,
  };
});
const surfaces = [-0.25, 0.25].map((x, i) => ({
  kind: 'defender',
  playerId: `clinch-${i}`,
  centre: { x, y: 0, z: 0.9 },
  radius: 0.72,
}));
let resting = { position: { x: 0, y: 0, z: 0.11 }, velocity: { x: 0, y: 0, z: 0 } };
const clinchFrames = [];
for (let i = 0; i < 80; i++) {
  resting = supportContinuousBodyContacts(resting.position, resting.velocity, surfaces, 0.025);
  assert.deepEqual(resting.velocity, { x: 0, y: 0, z: 0 });
  clinchFrames.push(resting);
}
const kicker = { ...a0, position: { x: -0.2, y: 0.17 }, facingAngle: Math.PI / 2 };
const contact = executeFootContact(
  {
    ...actorState,
    continuousFootContacts: [],
    ball: { x: 0, y: 0, height: 0.11, velocity: { x: 0, y: 0, z: 0 } },
  },
  kicker,
  {
    intended: 'inside',
    foot: 'right',
    desiredVelocity: { x: 0, y: 8, z: 0 },
    preparationSeconds: 0.2,
    contactSeconds: 0.06,
    balance: 1,
    pressure: 0,
  },
);
assert.ok(contact.available);
const released = integrateBallFlight(
  {
    position: { x: 0, y: 0, z: 0.11 },
    velocity: contact.outgoingVelocity,
    spin: contact.outgoingSpin,
    airborne: false,
    bounceCount: 0,
  },
  0.15,
  { groundContact: 'event-v1', rollingResistanceMultiplier: 1 },
);
const clinch = {
  surfaces,
  frames: clinchFrames,
  clearances: surfaces.map((b) => ballBodyClearance(resting.position, b)),
  maximumIterationsPerCall: 8,
  automaticOwner: false,
  automaticStop: false,
  contact,
  released,
  releasedClearances: surfaces.map((b) => ballBodyClearance(released.position, b)),
  apparatusOnly: true,
};
assert.ok(clinch.clearances.some((x) => x < 0));
assert.ok(clinch.releasedClearances.every((x) => x > 0));
const probeA = { ...a0, position: { x: 30, y: 30 }, velocity: { x: 3, y: 0 } };
const probeB = { ...b0, position: { x: 30.1, y: 30.68 }, velocity: { x: -3, y: 0 } };
const tangent = findPlayerBodyContact(probeA, probeB, 0.025, false);
assert.equal(tangent.unresolved, 'near_tangent_body');
const rearmState = {
  ...actorState,
  players: [probeA, { ...probeB, position: { x: 30.68, y: 30 } }],
  continuousPlayerContacts: [{ participants: [probeA.id, probeB.id], beganAt: 9 }],
};
assert.equal(retainPlayerBodyContacts(rearmState).length, 1);
rearmState.players[1].position.x += 0.011;
assert.equal(retainPlayerBodyContacts(rearmState).length, 0);
const uncertainties = {
  tangent,
  overlapping: findPlayerBodyContact(
    probeA,
    { ...probeB, position: { x: 30.5, y: 30 } },
    0.025,
    false,
  ),
};
assert.ok(
  rows.some((r) => r.saves.some((s) => s.persistentPairAndPending)),
  'save during pending strike and persistent pair',
);
const result = { source, rows, mechanics, balance, clinch, uncertainties };
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
if (check) {
  assert.deepEqual(json(result), read(`${ROOT}/canonical-${version}.json.gz`).result);
  console.log('PR213 exact-source canonical replay PASS');
} else {
  write(`${ROOT}/canonical-${version}.json.gz`, { result, costs });
  write(`${ROOT}/summary-${version}.json`, {
    source,
    rows: rows.map((r) => ({
      name: r.name,
      ...r.metrics,
      bodyTimes: r.bodies.map((c) => ({
        at: c.at,
        kind: c.kind,
        normalImpulse: c.normalImpulse,
        energyChange: c.energyAfter - c.energyBefore,
      })),
      strike: r.frames.at(-1).strike?.reason,
      challenge: r.frames.at(-1).challenge?.physical?.kind,
    })),
    mechanics,
    balance: balance.map((r) => ({
      name: r.name,
      initial: r.contact.balanceAfter,
      final: r.frames.at(-1).plantBalance,
    })),
    clinch: { clearances: clinch.clearances, releasedClearances: clinch.releasedClearances },
    costs,
  });
}
console.log(
  JSON.stringify({
    scenes: rows.length,
    reloads: rows.length * 3,
    costs,
    impacts: rows.reduce((n, r) => n + r.metrics.impacts, 0),
    unexplainedAcquisitions: rows.reduce((n, r) => n + r.metrics.unexplainedAcquisitions, 0),
  }),
);
