// Exploratory supplement after the six primary straight-delivery controls all retained.
// This method lives beside its data and has an independent byte hash, as in PR208.
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { hash, source } from '../../../scripts/pr199Evidence.mjs';
import { createPr205Fixture } from '../../../src/core/matchSimulation/pr205Laboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../../../src/core/matchSimulation/matchSimulation.ts';
import { sampleCanonicalOutcome } from '../../../src/core/matchSimulation/canonicalOutcome.ts';

const root = 'docs/performance/pr209';
const method = `${root}/bounce-observation-method.mjs`;
const manifest = source(),
  begin = performance.now(),
  usage = process.cpuUsage();
const rows = [];
for (const speed of [7, 14])
  for (const gaze of ['toward', 'away'])
    for (const spin of [false, true]) {
      const f = createPr205Fixture('team', speed);
      let s = f.state;
      s.seed = `pr209-bounce-observation-${speed}`;
      s.prospectiveMovement = 'observed-ball-contact-dev-v1';
      s.experimentalBoundedBallFlightBelief = true;
      s.experimentalReceiverAnticipation = true;
      s.experimentalReceiverSynchronisation = false;
      s.boundedReceiverRecovery = 'hold-local-v1';
      s.ballEnvironment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
      s.actionCooldown = 1;
      if (gaze === 'away') f.actor.facingAngle += Math.PI;
      s.ball = {
        ...s.ball,
        x: 40,
        y: 34,
        height: 0.11,
        velocity: { x: speed, y: 0, z: 1.2 },
        spin: spin ? { x: 80, y: 40, z: 50 } : { x: 0, y: 0, z: 0 },
        airborne: true,
        bounceCount: 0,
        looseSince: s.time,
      };
      delete s.liveBallFlightRuntime;
      const initialHash = hash(s),
        initialBall = globalThis.structuredClone(s.ball),
        frames = [],
        samples = [],
        actions = [];
      let bounceAt = null;
      for (let tick = 0; tick < 240; tick++) {
        const before = s;
        s = step(s, 0.025);
        const sample = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
        samples.push(sample);
        if (bounceAt === null && (s.ball.bounceCount ?? 0) > (before.ball.bounceCount ?? 0))
          bounceAt = s.time;
        const p = s.players.find((p) => p.id === f.actor.id);
        frames.push(
          globalThis.structuredClone({
            at: s.time,
            ball: s.ball,
            body: {
              position: p.position,
              velocity: p.velocity,
              facing: p.facingAngle,
              target: p.target,
              reason: p.locomotionReason,
              intensity: p.locomotionIntensity,
              balance: p.plantBalance,
            },
            sensor: s.liveBallFlightRuntime?.sensors[p.id] ?? null,
            preparation: s.receptionPreparation ?? null,
            foot: s.lastGroundContact ?? null,
            reception: s.lastReceptionOutcome ?? null,
            contacts: sample.contacts,
          }),
        );
        if (s.decisionIndex !== before.decisionIndex)
          actions.push({ at: s.time, action: s.currentAction });
      }
      const control = samples.find((r) => r.ownerId === f.actor.id);
      const one = control && samples.find((r) => r.at >= control.at + 1 - 1e-8);
      const team = s.players.filter((p) => p.team === f.actor.team).map((p) => p.id);
      const firstSight = frames.find((r) => r.sensor?.optical);
      const firstMotion = frames.find((r) => r.sensor?.belief?.velocity);
      const afterBounce = frames.find(
        (r) => bounceAt !== null && r.sensor?.belief?.evidenceAt >= bounceAt - 1e-8,
      );
      const firstTouch = frames.find((r) => r.contacts.some((c) => c.actorId === f.actor.id));
      rows.push({
        speed,
        gaze,
        spin,
        initialHash,
        initialBall,
        bounceAt,
        firstSightAt: firstSight?.at ?? null,
        firstMotionAt: firstMotion?.at ?? null,
        firstMotionEvidenceAfterBounceAt: afterBounce?.at ?? null,
        firstTouchAt: firstTouch?.at ?? null,
        firstTouch: firstTouch?.reception ?? null,
        controlAt: control?.at ?? null,
        oneSecond: one ?? null,
        retained: one ? team.includes(one.ownerId) : null,
        frames,
        actions,
        finalHash: hash(s),
      });
    }
assert.deepEqual(source(), manifest);
const result = {
  schema: 'pr209-bounce-observation-supplement-v1',
  source: hash(manifest),
  method: { path: method, sha256: hash(readFileSync(method)) },
  qualification:
    'Exploratory harder/away-facing controls chosen after primary success. Gaze is implemented by actual initial body orientation, so sensory delay and physical turning are not isolated. No observation, future bounce or control is injected. BounceAt is an end-of-25ms-step witness; fresh motion after it is not proof that the actor explicitly recognized a bounce.',
  rows,
};
const output = `${root}/bounce-observation-supplement-v1.json.gz`;
if (process.argv.includes('--check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).result), hash(result));
else
  writeFileSync(
    output,
    gzipSync(
      JSON.stringify({
        result,
        costs: {
          wallSeconds: (performance.now() - begin) / 1000,
          cpuSeconds: Object.values(process.cpuUsage(usage)).reduce((a, b) => a + b, 0) / 1e6,
          peakRSSKiB: process.resourceUsage().maxRSS,
        },
      }),
      { level: 9 },
    ),
    { flag: 'wx' },
  );
console.log(
  JSON.stringify(
    rows.map(({ frames, actions, initialBall, firstTouch, ...r }) => {
      void frames;
      void actions;
      void initialBall;
      void firstTouch;
      return r;
    }),
  ),
);
