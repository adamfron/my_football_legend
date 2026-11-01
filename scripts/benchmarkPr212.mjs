import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { createPr212Scene, tracePr212, pr212Cases } from './pr212Scenarios.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { integrateCanonicalMovement } from '../src/core/matchSimulation/canonicalMovement.ts';
import {
  ballBodyClearance,
  supportContinuousBodyContacts,
} from '../src/core/matchSimulation/ballContactResolution.ts';
import { integrateBallFlight } from '../src/core/matchSimulation/ballPhysics.ts';
import { ROOT, hash, write, read, recordPr212Source, checkPr212Source } from './pr212Evidence.mjs';
const check = process.argv.includes('--check');
const version = process.argv.find((s) => s.startsWith('--version='))?.split('=')[1] ?? 'final-v3';
if (process.argv.includes('--record-source')) recordPr212Source();
const source = checkPr212Source();
const started = performance.now(),
  cpu = process.cpuUsage();
const json = (x) => JSON.parse(JSON.stringify(x));
const rows = pr212Cases.map((config) => {
  const f = createPr212Scene(config),
    r = tracePr212(f.initial, f.config.ticks);
  const saves = [0, 2, 3].map((ticks) => {
    const a = tracePr212(f.initial, ticks).state;
    const b = tacticalMatchStateSchema.parse(json(a));
    const ra = tracePr212(a, 8),
      rb = tracePr212(b, 8);
    assert.deepEqual(json(rb.frames), json(ra.frames));
    assert.deepEqual(
      json(tacticalMatchStateSchema.parse(rb.state)),
      json(tacticalMatchStateSchema.parse(ra.state)),
    );
    return {
      ticks,
      bytes: Buffer.byteLength(JSON.stringify(a)),
      equal: true,
      terminal: hash(json(tacticalMatchStateSchema.parse(rb.state))),
    };
  });
  const contacts = new Map(),
    bodies = new Map(),
    owners = new Set();
  let possessionChanges = 0,
    controlAcquisitions = 0,
    looseSeconds = 0,
    displacement = 0;
  let previousOwner = f.initial.ball.ownerId;
  for (let i = 0; i < r.frames.length; i++) {
    const a = r.frames[i],
      b = r.frames[i - 1];
    for (const [actorId, c] of [
      [a.groundContact?.actorId, a.groundContact?.surfaceContact],
      [a.strike?.actorId, a.strike?.outcome === 'contact' ? a.strike.contact : undefined],
      [a.challenge?.actorId, a.challenge?.physical?.contact],
    ])
      if (c?.available)
        contacts.set(`${actorId}:${c.at}:${c.foot}:${hash(c.impulse)}`, { actorId, ...c });
    if (a.bodyContact)
      bodies.set(
        `${a.bodyContact.at}:${a.bodyContact.playerId}:${a.bodyContact.kind}`,
        a.bodyContact,
      );
    if (a.ownerId) owners.add(`${a.ownerId}:${a.ownershipStartedAt}`);
    if (b) {
      if (a.ownerId !== b.ownerId && a.ownerId) {
        controlAcquisitions++;
        if (previousOwner && previousOwner !== a.ownerId) possessionChanges++;
        previousOwner = a.ownerId;
      }
      if (!a.ownerId) looseSeconds += a.time - b.time;
      displacement += Math.hypot(a.ball.x - b.ball.x, a.ball.y - b.ball.y);
    }
  }
  return {
    name: f.config.name,
    config: f.config,
    initial: f.initial,
    frames: r.frames,
    saves,
    metrics: {
      attempted: 1,
      realFootContacts: contacts.size,
      activeBallContact: r.state.lastChallenge?.physical?.kind === 'ball',
      activeBodyContacts: r.state.lastChallenge?.physical?.kind === 'body' ? 1 : 0,
      passiveContacts: bodies.size,
      controlAcquisitions,
      possessionChanges,
      uniqueControllingEpisodes: owners.size,
      looseSeconds,
      displacement,
      elapsed: r.state.time - f.initial.time,
      physicalAttemptBytes: Buffer.byteLength(
        JSON.stringify(f.initial.defensiveChallenge?.physicalAttempt ?? null),
      ),
    },
    contacts: [...contacts.values()],
    terminal: hash(json(tacticalMatchStateSchema.parse(r.state))),
  };
});
assert.equal(
  rows.find((r) => r.name === 'paired-earlier').frames.at(-1).strike.reason,
  'active_challenge',
);
assert.equal(rows.find((r) => r.name === 'paired-later').frames.at(-1).strike.outcome, 'contact');
assert.equal(
  rows.find((r) => r.name === 'paired-unresolved-10ms').frames.at(-1).challenge.physical.kind,
  'unresolved',
);
const actor = createPr212Scene({ name: 'balance' }).initial.players.find(
  (p) => p.id === 'geometry:anchor:5',
);
const balance = [
  { name: 'stable-low-speed', speed: 0, target: { x: 1, y: 0 }, balance: 1 },
  { name: 'miss-without-evidenced-body-load', speed: 0, target: { x: 1, y: 0 }, balance: 1 },
  { name: 'fast-redirection', speed: 8, target: { x: 0, y: 8 }, balance: 1 },
  { name: 'single-support-disturbed', speed: 4, target: { x: 0, y: 4 }, balance: 0.5 },
  { name: 'mild-recovery', speed: 0, target: { x: 0, y: 0 }, balance: 0.7 },
  { name: 'constructed-severe', speed: 10, target: { x: -10, y: 0 }, balance: 0.35 },
].map((c) => {
  let p = {
    ...actor,
    position: { x: 30, y: 34 },
    velocity: { x: c.speed, y: 0 },
    plantBalance: { balance: c.balance, load: 0, support: 'left' },
  };
  const frames = [];
  for (let i = 0; i < 80; i++) {
    const target = i < 8 ? c.target : { x: 0, y: 0 };
    const body = integrateCanonicalMovement(p, {
      target: { x: p.position.x + target.x, y: p.position.y + target.y },
      targetSpeed: Math.hypot(target.x, target.y),
      desiredFacingAngle: p.facingAngle,
      dt: 0.025,
      balance: 1,
      structural: false,
      receivingMomentum: false,
    });
    p = { ...p, ...body };
    frames.push({
      at: (i + 1) * 0.025,
      position: p.position,
      velocity: p.velocity,
      plantBalance: p.plantBalance,
    });
  }
  return { config: c, frames, downedGeometrySupported: false, newInjuryOutcomes: false };
});
const bodies = [-0.25, 0.25].map((x, i) => ({
  kind: 'defender',
  playerId: `clinch-${i}`,
  centre: { x, y: 0, z: 0.9 },
  radius: 0.72,
}));
const point = { x: 0, y: 0, z: 0.11 },
  velocity = { x: 0, y: 0, z: 0 };
const constrained = supportContinuousBodyContacts(point, velocity, bodies, 0.025);
const afterImpulse = integrateBallFlight(
  {
    position: point,
    velocity: { x: 0, y: 8, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    airborne: false,
    bounceCount: 0,
  },
  0.1,
  { groundContact: 'event-v1', rollingResistanceMultiplier: 1 },
);
const clinch = {
  bodies,
  initial: { point, velocity },
  constrained,
  remainingClearances: bodies.map((b) => ballBodyClearance(constrained.position, b)),
  ownerAwarded: false,
  automaticStoppage: false,
  fallGeometrySupported: false,
  escapedAfterFiniteImpulse: {
    ...afterImpulse,
    clearances: bodies.map((b) => ballBodyClearance(afterImpulse.position, b)),
  },
};
assert.deepEqual(constrained.velocity, velocity);
assert.ok(
  clinch.remainingClearances.some((x) => x < 0),
  'retain incompatible crowded geometry as unresolved',
);
assert.ok(clinch.escapedAfterFiniteImpulse.clearances.every((x) => x > 0));
const result = { source, rows, balance, clinch };
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
if (check) {
  assert.deepEqual(json(result), read(`${ROOT}/canonical-${version}.json.gz`).result);
  console.log('PR212 exact-source canonical replay PASS');
} else {
  write(`${ROOT}/canonical-${version}.json.gz`, { result, costs });
  write(`${ROOT}/summary-${version}.json`, {
    source,
    rows: rows.map((r) => ({
      name: r.name,
      ...r.metrics,
      strike: r.frames.at(-1).strike?.reason,
      challenge: r.frames.at(-1).challenge?.physical,
    })),
    costs,
  });
}
console.log(
  JSON.stringify({
    scenes: rows.length,
    reloads: rows.length * 3,
    costs,
    results: rows.map((r) => ({
      name: r.name,
      ...r.metrics,
      strike: r.frames.at(-1).strike?.reason,
      challenge: r.frames.at(-1).challenge?.physical?.kind,
    })),
  }),
);
