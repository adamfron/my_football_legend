import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createPr205Fixture } from '../src/core/matchSimulation/pr205Laboratory.ts';
import { locallyObservedRecovery } from '../src/core/matchSimulation/localReception.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { sampleCanonicalOutcome } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash, source } from './pr199Evidence.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'recovery-v1';
assert.match(version, /^[a-z0-9-]+$/);
const manifest = source(),
  started = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
for (const role of ['team', 'opponent'])
  for (const kind of ['pass', 'cross', 'loose']) {
    const f = createPr205Fixture(role, 1),
      p = f.actor;
    let s = f.state;
    s.prospectiveMovement = 'observed-ball-contact-dev-v1';
    p.facingAngle = Math.PI / 2;
    s.ball.x = 54;
    s.ball.velocity.y = 0;
    if (kind === 'loose') delete s.ball.travelKind;
    else s.ball.travelKind = kind;
    // No injected belief: the canonical optical adapter must first see the ball.
    delete s.liveBallFlightRuntime;
    delete s.activePerceptionRuntime;
    const initialHash = hash(s),
      frames = [],
      contacts = [],
      actions = [];
    let sight = null,
      recoveryAt = null,
      controlAt = null,
      retainedAtOneSecond = null;
    for (let i = 0; i < 200; i++) {
      const before = s,
        old = before.players.find((q) => q.id === p.id);
      const recovery = locallyObservedRecovery(before, old);
      if (recoveryAt === null && recovery) recoveryAt = before.time;
      s = step(s, 0.025);
      const q = s.players.find((q) => q.id === p.id),
        sensor = s.liveBallFlightRuntime?.sensors[p.id];
      if (sight === null && sensor?.optical) sight = sensor.optical.at;
      if (controlAt === null && s.ball.ownerId === p.id) controlAt = s.time;
      if (controlAt !== null && retainedAtOneSecond === null && s.time >= controlAt + 1 - 1e-7)
        retainedAtOneSecond =
          s.possessionTeam === p.team &&
          Boolean(
            s.ball.ownerId && s.players.find((q) => q.id === s.ball.ownerId)?.team === p.team,
          );
      const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
      if (sample.contacts.length)
        contacts.push({
          at: s.time,
          contacts: sample.contacts,
          ground: s.lastGroundContact ?? null,
          body: s.lastBallContact ?? null,
          ball: s.ball,
        });
      if (s.decisionIndex !== before.decisionIndex)
        actions.push({ at: s.time, action: s.currentAction, decisionIndex: s.decisionIndex });
      frames.push({
        at: s.time,
        position: q.position,
        velocity: q.velocity,
        target: q.target,
        facing: q.facingAngle,
        intensity: q.locomotionIntensity,
        reason: q.locomotionReason,
        acceleration: {
          x: (q.velocity.x - old.velocity.x) / 0.025,
          y: (q.velocity.y - old.velocity.y) / 0.025,
        },
        recovery: recovery
          ? { recognisedAt: recovery.recognisedAt, movement: recovery.movement }
          : null,
        sightAt: sensor?.belief?.lastObservation?.at ?? null,
        motionAt: sensor?.belief?.motionEvidenceAt ?? null,
        ball: s.ball,
        owner: s.ball.ownerId ?? null,
      });
    }
    rows.push({
      role,
      kind,
      initialHash,
      sight,
      recoveryAt,
      controlAt,
      retainedAtOneSecond,
      contacts,
      actions,
      frames,
      finalHash: hash(s),
    });
  }
assert.deepEqual(source(), manifest, 'Recovery source changed');
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
  peakRssKiB: process.resourceUsage().maxRSS,
};
const output = `docs/performance/pr205/${version}.json.gz`;
if (args.has('check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).rows), hash(rows));
else {
  mkdirSync('docs/performance/pr205', { recursive: true });
  writeFileSync(
    output,
    gzipSync(JSON.stringify({ source: hash(manifest), rows, costs }), { level: 9 }),
    { flag: 'wx' },
  );
}
console.log(
  JSON.stringify({
    source: hash(manifest),
    costs,
    rows: rows.map((r) => ({
      role: r.role,
      kind: r.kind,
      sight: r.sight,
      recoveryAt: r.recoveryAt,
      controlAt: r.controlAt,
      retained: r.retainedAtOneSecond,
      contacts: r.contacts.length,
      nextActions: r.actions.map((a) => a.action),
    })),
  }),
);
