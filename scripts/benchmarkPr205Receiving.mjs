import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createFreshReleases } from './pr201Fixtures.mjs';
import { continueRelease } from './pr198Laboratory.mjs';
import { locallyObservedRecovery } from '../src/core/matchSimulation/localReception.ts';
import { hash, source } from './pr199Evidence.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'receiving-v1';
assert.match(version, /^[a-z0-9-]+$/);
const manifest = source(),
  started = performance.now(),
  cpu = process.cpuUsage();
const launches = createFreshReleases(201);
const selected = launches.entries.filter(
  (e) => e.skill === 55 && e.factor !== 'late_reacquisition',
);
assert.equal(selected.length, 20);
const flags = {
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true,
  experimentalReceiverSynchronisation: false,
  experimentalBoundedBallFlightBelief: true,
  boundedReceiverRecovery: 'hold-local-v1',
  experimentalActivePerception: true,
  experimentalReceivingPositions: true,
  situationalAwareness: 'bounded-v1',
};
const rows = [];
for (const release of selected)
  for (const mode of ['two-pass-continuity-dev-v1', 'observed-ball-contact-dev-v1']) {
    const telemetry = [],
      contacts = [],
      actions = [];
    let firstSight = null,
      firstRecovery = null;
    const result = continueRelease(
      release,
      { ...flags, prospectiveMovement: mode },
      (s) => {
        delete s.integrationProfile;
      },
      (before, s, sample) => {
        const p = s.players.find((p) => p.id === release.contract.receiverId),
          old = before.players.find((q) => q.id === p.id);
        const sensor = s.liveBallFlightRuntime?.sensors[p.id];
        if (firstSight === null && sensor?.optical) firstSight = sensor.optical.at;
        const recovery = locallyObservedRecovery(before, old);
        if (firstRecovery === null && recovery) firstRecovery = before.time;
        if (sample.contacts.length)
          contacts.push({
            at: s.time,
            contacts: sample.contacts,
            ground: s.lastGroundContact ?? null,
            body: s.lastBallContact ?? null,
            ball: s.ball,
          });
        if (s.decisionIndex !== before.decisionIndex)
          actions.push({ at: s.time, action: s.currentAction });
        if (
          Math.round((s.time - release.contract.releasedAt) * 40) % 4 === 0 ||
          sample.contacts.length
        )
          telemetry.push({
            at: s.time,
            position: p.position,
            velocity: p.velocity,
            target: p.target,
            facing: p.facingAngle,
            intensity: p.locomotionIntensity,
            reason: p.locomotionReason,
            acceleration: {
              x: (p.velocity.x - old.velocity.x) / 0.025,
              y: (p.velocity.y - old.velocity.y) / 0.025,
            },
            sightAt: sensor?.belief?.lastObservation?.at ?? null,
            motionAt: sensor?.belief?.motionEvidenceAt ?? null,
            recovery: recovery?.movement ?? null,
          });
      },
    );
    rows.push({
      family: release.family,
      sample: release.sample,
      factor: release.factor,
      mode,
      releaseHash: release.releaseHash,
      ballHash: release.ballHash,
      firstSight,
      firstRecovery,
      outcome: result.outcome,
      diagnostic: result.diagnostic,
      frames: result.frames,
      telemetry,
      contacts,
      actions,
      startHash: result.startHash,
      finalHash: result.finalHash,
    });
  }
assert.deepEqual(source(), manifest, 'Receiving source changed');
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
    gzipSync(JSON.stringify({ source: hash(manifest), rows, rejected: launches.rejected, costs }), {
      level: 9,
    }),
    { flag: 'wx' },
  );
}
console.log(
  JSON.stringify({
    output,
    source: hash(manifest),
    costs,
    rows: rows.map((r) => ({
      family: r.family,
      sample: r.sample,
      factor: r.factor,
      mode: r.mode,
      firstSight: r.firstSight,
      firstRecovery: r.firstRecovery,
      outcome: r.outcome,
    })),
  }),
);
