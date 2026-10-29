import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import { continueRelease } from './pr198Laboratory.mjs';
import { createFreshReleases } from './pr201Fixtures.mjs';
import { hash, source } from './pr201Evidence.mjs';

// Development intervention: attributes are changed only after the ball is released.
// Thus each quartet starts with exactly the same actual delivery and body state.
const start = performance.now(), cpu = process.cpuUsage();
const sourceBefore = source();
const releases = [200, 201].flatMap((edition) =>
  createFreshReleases(edition).entries.filter((entry) => entry.skill === 55).map((entry) => ({ ...entry, edition })),
);
const flags = {
  experimentalDefensiveReception: true,
  experimentalHeightAwarePassing: true,
  experimentalReceiverAnticipation: true,
  experimentalReceiverSynchronisation: false,
  experimentalCanonicalArrival: false,
  experimentalBoundedBallFlightBelief: true,
  boundedReceiverRecovery: 'hold-local-v1',
};
const groups = [
  { id: 'LL', gameReading: 20, firstTouch: 20 },
  { id: 'LH', gameReading: 20, firstTouch: 85 },
  { id: 'HL', gameReading: 85, firstTouch: 20 },
  { id: 'HH', gameReading: 85, firstTouch: 85 },
];
const rows = [];
for (const e of releases) {
  for (const g of groups) {
    const copy = globalThis.structuredClone(e);
    const p = copy.state.players.find((player) => player.id === e.contract.receiverId);
    p.profile.attributes.gameReading = g.gameReading;
    p.profile.attributes.firstTouch = g.firstTouch;
    let firstSight = null, firstMotionEvidence = null, firstDisplacement = null;
    const result = continueRelease(copy, flags, undefined, (_before, state) => {
      const player = state.players.find((item) => item.id === e.contract.receiverId);
      const belief = state.liveBallFlightRuntime?.sensors[player?.id]?.belief;
      if (firstSight === null && belief?.lastObservation) firstSight = belief.lastObservation.at;
      if (firstMotionEvidence === null && belief?.motionEvidenceAt != null) firstMotionEvidence = belief.motionEvidenceAt;
      if (firstDisplacement === null && player && Math.hypot(player.position.x - p.position.x, player.position.y - p.position.y) > 0.1)
        firstDisplacement = state.time;
    });
    rows.push({ edition: e.edition, family: e.family, factor: e.factor, sample: e.sample, seed: e.seed,
      group: g.id, releaseHash: e.releaseHash, ballHash: e.ballHash, initialReceiverHash: e.receiverHash,
      releaseAt: e.state.time, firstSight, firstMotionEvidence, firstDisplacement,
      startHash: result.startHash, finalHash: result.finalHash, samplesHash: result.samplesHash,
      outcome: result.outcome, diagnostic: result.diagnostic, frames: result.frames });
  }
  if (rows.length % 40 === 0) console.log('factorial arms', rows.length);
}
const classify = (r, key) => {
  if (key === 'touch') return Number(r.outcome.directReceiverTouch);
  if (key === 'control') return Number(r.outcome.directReceiverTouch && r.outcome.receiverControl);
  return Number(r.outcome.directReceiverTouch && r.outcome.teamPossessionAtOneSecond);
};
const stats = (subset) => Object.fromEntries(['touch', 'control', 'retention'].map((metric) => {
  const paired = new Map();
  for (const row of subset) {
    const k = `${row.edition}/${row.family}/${row.factor}/${row.sample}`;
    if (!paired.has(k)) paired.set(k, { seed: row.seed });
    paired.get(k)[row.group] = classify(row, metric);
  }
  const trials = [...paired.values()];
  const means = Object.fromEntries(groups.map((g) => [g.id, trials.reduce((s, x) => s + x[g.id], 0) / trials.length]));
  const delta = (f) => {
    const clusters = new Map();
    for (const trial of trials) {
      if (!clusters.has(trial.seed)) clusters.set(trial.seed, []);
      clusters.get(trial.seed).push(f(trial));
    }
    const values = [...clusters.values()].map((v) => v.reduce((a, b) => a + b, 0) / v.length);
    const mean = trials.reduce((a, x) => a + f(x), 0) / trials.length;
    const clusterMean = values.reduce((a, b) => a + b, 0) / values.length;
    const se = values.length > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - clusterMean) ** 2, 0) / (values.length - 1) / values.length) : null;
    return { mean, independentSeeds: values.length, clusterStandardError: se, normal95: se === null ? null : [mean - 1.96 * se, mean + 1.96 * se] };
  };
  return [metric, { n: trials.length, means, readingAtLowTouch: delta((x) => x.HL - x.LL),
    readingAtHighTouch: delta((x) => x.HH - x.LH), touchAtLowReading: delta((x) => x.LH - x.LL),
    touchAtHighReading: delta((x) => x.HH - x.HL), interaction: delta((x) => x.HH - x.LH - x.HL + x.LL) }];
}));
const summary = { overall: stats(rows), byFamily: {}, byFactor: {} };
for (const family of new Set(rows.map((r) => r.family))) summary.byFamily[family] = stats(rows.filter((r) => r.family === family));
for (const factor of new Set(rows.map((r) => r.factor))) summary.byFactor[factor] = stats(rows.filter((r) => r.factor === factor));
const sourceAfter = source();
const stable = hash(sourceBefore) === hash(sourceAfter);
const receipt = { schema: 'pr204-factorial-development-v1', source: hash(sourceBefore), sourceManifest: sourceBefore, sourceAfter: hash(sourceAfter), stable,
  qualification: 'Attributes intervene after release, not before it. Pairing fixes the launched ball, initial bodies, other attributes and environment; ensuing trajectories may diverge through canonical contact. Intervals cluster factors by seed and are approximate descriptive intervals, not a calibrated skill curve. Families and preparation times are limited by the inherited fixtures. First displacement may reflect initial velocity, not recognition or the start of voluntary preparation.',
  costs: { wallSeconds: (performance.now() - start) / 1000, cpu: process.cpuUsage(cpu), peakRSSKiB: process.resourceUsage().maxRSS, node: process.version, platform: process.platform }, summary, rows };
mkdirSync('docs/performance/pr204', { recursive: true });
writeFileSync(`docs/performance/pr204/factorial-${stable ? 'development' : 'unstable'}-v1.json.gz`, gzipSync(JSON.stringify(receipt), { level: 9 }), { flag: 'wx' });
console.log(JSON.stringify({ costs: receipt.costs, summary }, null, 2));
if (!stable) {
  console.error('Source changed during factorial run; repeat on stable source');
  process.exitCode = 1;
}
