// PR205 bounded derivative of the unchanged PR204 decision apparatus.
// Development-only pressure/alternative probe. No production decisions are overridden.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import { createProspectiveFixture } from '../src/core/matchSimulation/prospectivePlayLaboratory.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { advanceActivePerception } from '../src/core/matchSimulation/activePerception.ts';
import { advanceLiveBallFlight } from '../src/core/matchSimulation/liveBallFlight.ts';
import { advanceReceivingPositions } from '../src/core/matchSimulation/receivingPositions.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import {
  sampleCanonicalOutcome,
  interpretCanonicalOutcome,
  outcomeContractSchema,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { distance, distanceToSegment } from '../src/core/matchSimulation/matchSpace.ts';

const manifest = source(),
  fingerprint = hash(manifest);
const base = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const started = performance.now(),
  cpu = process.cpuUsage();
const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'support-v1';
assert.match(version, /^[a-z0-9-]+$/);
const rows = [];
for (const sample of [1, 2, 3, 5])
  for (const arm of ['open', 'pressure'])
    for (const profile of [
      'prospective-play-v1',
      'two-pass-continuity-dev-v1',
      'observed-ball-contact-dev-v1',
    ]) {
      const f = createProspectiveFixture({
        seed: `pr203-${sample}`,
        reading: 85,
        profile: 'prospective-play-v1',
      });
      if (profile !== 'prospective-play-v1') {
        f.state.prospectiveMovement = profile;
        delete f.state.integrationProfile;
      }
      // Additional teammate is a real actor and an available retreat option at setup.
      const alternative = f.state.players.find(
        (p) =>
          p.team === f.a.team &&
          ![f.a.id, f.b.id, f.c.id].includes(p.id) &&
          p.slot.position !== 'goalkeeper',
      );
      alternative.position = { x: 46, y: 42 };
      alternative.target = { ...alternative.position };
      alternative.anchor = { ...alternative.position };
      alternative.neutralAnchor = { ...alternative.position };
      alternative.velocity = { x: 0, y: 0 };
      if (arm === 'unseen')
        f.b.facingAngle = Math.atan2(
          f.a.position.y - f.b.position.y,
          f.a.position.x - f.b.position.x,
        );
      let s = advanceReceivingPositions(advanceActivePerception(advanceLiveBallFlight(f.state)));
      const initialHash = hash(s),
        frames = [];
      const start = s.time,
        decisions = [],
        passes = [],
        episodes = [];
      let requested = false,
        intervened = false;
      withBoundedObserver(
        (t) => {
          if (t.actorId !== f.b.id || t.stage !== 'decision') return;
          const b = s.players.find((p) => p.id === f.b.id),
            c = s.players.find((p) => p.id === f.c.id);
          const foes = s.players.filter((p) => p.team !== b.team);
          decisions.push({
            at: t.at,
            action: t.action ?? null,
            decision: t.decision ?? null,
            scene: t.scene ?? null,
            candidates: t.candidates ?? null,
            preStepAt: s.time,
            preStepCPosition: c.position,
            preStepBPosition: b.position,
            preStepNearestOpponent: Math.min(...foes.map((p) => distance(p.position, b.position))),
            preStepLaneDistance: Math.min(
              ...foes.map((p) => distanceToSegment(p.position, b.position, c.position)),
            ),
          });
        },
        () => {
          for (let i = 0; i < 280; i++) {
            if (!requested && s.time - start >= 0.9 - 1e-7) {
              requested = true;
              const b = s.players.find((p) => p.id === f.b.id);
              s = resolveMatchAction(
                s,
                {
                  type: 'pass',
                  actorId: f.a.id,
                  receiverId: f.b.id,
                  target: { ...b.position },
                  intent: 'support',
                  delivery: 'ground',
                },
                'autonomous_npc',
              );
            }
            if (!intervened && s.time - start >= 1.2) {
              intervened = true;
              if (arm === 'pressure') {
                const b = s.players.find((p) => p.id === f.b.id),
                  foe = s.players.find((p) => p.id === f.opponent.id);
                foe.position = { x: b.position.x + 0.6, y: b.position.y + 0.2 };
                foe.target = { ...foe.position };
              }
            }
            const before = s;
            s = step(s, 0.025);
            const fact = sampleCanonicalOutcome(before, s, 'original-delivery-v3');
            const c = s.players.find((p) => p.id === f.c.id),
              previous = before.players.find((p) => p.id === c.id);
            if (i % 4 === 0 || fact.contacts.length)
              frames.push({
                at: s.time,
                position: c.position,
                velocity: c.velocity,
                acceleration: {
                  x: (c.velocity.x - previous.velocity.x) / 0.025,
                  y: (c.velocity.y - previous.velocity.y) / 0.025,
                },
                target: c.target,
                facing: c.facingAngle,
                intensity: c.locomotionIntensity,
                reason: c.locomotionReason,
                sensor: s.liveBallFlightRuntime?.sensors[c.id] ?? null,
                ball: s.ball,
                contacts: fact.contacts,
                ground: s.lastGroundContact ?? null,
                body: s.lastBallContact ?? null,
              });
            for (const e of episodes) e.samples.push(fact);
            if (s.lastPassDiagnostic?.passId !== before.lastPassDiagnostic?.passId) {
              const d = s.lastPassDiagnostic;
              passes.push({
                at: s.time,
                passId: d.passId,
                actorId: d.passerId,
                receiverId: d.intendedReceiverId,
              });
              if (d.passerId === f.b.id && d.intendedReceiverId === f.c.id)
                episodes.push({
                  contract: outcomeContractSchema.parse({
                    version: 'original-delivery-v3',
                    actorId: f.b.id,
                    receiverId: f.c.id,
                    teamIds: s.players.filter((p) => p.team === f.b.team).map((p) => p.id),
                    opponentIds: s.players.filter((p) => p.team !== f.b.team).map((p) => p.id),
                    requestedAt: s.time,
                    releasedAt: d.releasedAt,
                    horizonAt: start + 7,
                    passId: d.passId,
                    shotId: null,
                    information: 'privileged_engineering_observer',
                    conditionalOnRelease: true,
                  }),
                  samples: [fact],
                });
            }
            if (s.restart || s.postGoal) break;
          }
        },
      );
      rows.push({
        sample,
        arm,
        profile,
        initialHash,
        frames,
        alternativeId: alternative.id,
        decisions,
        passes,
        outcomes: episodes.map((e) => interpretCanonicalOutcome(e.contract, e.samples)),
      });
    }
const result = {
  classification:
    'development; scene modification and exogenous pressure intervention; not independent confirmation',
  source: { base, fingerprint, manifest },
  limitations: [
    'Six seeds, one receiver skill and a single artificial geometry are not a general pressure model.',
    'A to B release and pressure repositioning are explicit development interventions.',
    'Physical positions and lane measurements are pre-step snapshots, at most one tick before the decision; scene, candidates and action are exact decision telemetry.',
    'Candidate menu and action are actual decision telemetry; candidate evidence IDs need not mean direct current visibility.',
    'No persistent unseen-support condition is implemented or proved: later reacquisition is an expected positive control.',
  ],
  rows,
};
assert.equal(hash(source()), fingerprint, 'Source changed during experiment');
result.costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpu: process.cpuUsage(cpu),
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const data = JSON.stringify(result);
const path = 'docs/performance/pr205/' + version + '.json.gz';
const saved = JSON.parse(readFileSync('docs/performance/pr204/decision-corpus.json', 'utf8'));
for (const row of rows.filter((r) => r.profile !== 'observed-ball-contact-dev-v1')) {
  const { initialHash, frames, ...physical } = row;
  void initialHash;
  void frames;
  assert.deepEqual(
    JSON.parse(JSON.stringify(physical)),
    saved.rows.find(
      (r) => r.sample === row.sample && r.arm === row.arm && r.profile === row.profile,
    ),
    'Historical support outcome drift',
  );
}
if (args.has('check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(path))).rows), hash(rows));
else {
  mkdirSync('docs/performance/pr205', { recursive: true });
  writeFileSync(path, gzipSync(data, { level: 9 }), { flag: 'wx' });
}
console.log(
  JSON.stringify({
    path,
    source: fingerprint,
    costs: result.costs,
    rows: rows.map((r) => ({
      sample: r.sample,
      arm: r.arm,
      profile: r.profile,
      releases: r.outcomes.length,
      control: r.outcomes.some((o) => o.directReceiverTouch && o.receiverControl),
      retention: r.outcomes.some((o) => o.directReceiverTouch && o.teamPossessionAtOneSecond),
      censored: r.outcomes.map((o) => o.censored),
      outcomes: r.outcomes,
    })),
  }),
);
