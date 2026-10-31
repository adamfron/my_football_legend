import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { hash } from './pr199Evidence.mjs';
const options = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const root = options.get('root') ?? 'docs/performance/pr208';
const read = (mode) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/${mode}-development-v1.json.gz`)));
const stats = (values) => {
  const a = values.filter(Number.isFinite),
    n = a.length;
  if (!n) return { n: 0, mean: null, sd: null, min: null, max: null };
  const mean = a.reduce((s, x) => s + x, 0) / n;
  return {
    n,
    mean,
    sd: Math.sqrt(a.reduce((s, x) => s + (x - mean) ** 2, 0) / n),
    min: Math.min(...a),
    max: Math.max(...a),
  };
};
const sweep = read('sweep'),
  trajectories = read('trajectories'),
  live = read('live');
assert.equal(sweep.receipt.source, trajectories.receipt.source);
assert.equal(sweep.receipt.source, live.receipt.source);
const groups = new Map();
for (const row of trajectories.receipt.result.rows)
  for (const a of row.arms) {
    const c = row.config,
      key = [
        c.family,
        c.metres,
        c.primary,
        c.technique,
        c.intent,
        c.context,
        c.delivery,
        a.model,
      ].join('/');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
const strata = [...groups].map(([key, rows]) => ({
  key,
  attempts: rows.length,
  released: rows.filter((a) => a.released).length,
  arms: Object.fromEntries(
    ['legacy', 'corrected'].map((edition) => {
      const a = rows.filter((a) => a.released),
        f = a.map((a) => a[edition]);
      return [
        edition,
        {
          missingPlane: f.filter((f) => !f.plane).length,
          stopCensored: f.filter((f) => f.stopCensored).length,
          apex: stats(f.map((f) => f.apex)),
          arrivalTime: stats(f.map((f) => f.plane?.at)),
          arrivalSpeed: stats(f.map((f) => f.plane?.speed)),
          lateralError: stats(f.map((f) => f.lateralError)),
          depthError: stats(f.map((f) => f.longitudinalError)),
          distanceToReceptionPlaneAtStop: stats(a.map((a) => a.target.x - a[edition].stop.x)),
          goalPlaneHeight: stats(f.map((f) => f.plane?.z)),
          bounceCount: stats(f.map((f) => f.bounceCount ?? null)),
          firstBounceTime: stats(f.map((f) => f.impacts?.[0]?.at)),
          liftAboveFiveMillimetres: f.filter((f) => f.apex > 0.115).length,
        },
      ];
    }),
  ),
}));
const liveGroups = new Map(),
  retentionChanges = [];
for (const row of live.receipt.result.rows)
  for (const a of row.arms) {
    const key = [row.config.family, row.config.context, a.model].join('/');
    if (!liveGroups.has(key)) liveGroups.set(key, []);
    liveGroups.get(key).push(a);
    if (
      a.legacy?.outcome.teamPossessionAtOneSecond !== a.corrected?.outcome.teamPossessionAtOneSecond
    )
      retentionChanges.push({
        config: row.config,
        model: a.model,
        velocity: a.initialVelocity,
        spin: a.initialSpin,
        legacy: a.legacy.outcome,
        corrected: a.corrected.outcome,
        legacyFlight: a.legacyFlight,
        correctedFlight: a.correctedFlight,
        paired: a.paired,
        legacyActions: a.legacy.actions,
        correctedActions: a.corrected.actions,
      });
  }
const continuations = [...liveGroups].map(([key, rows]) => ({
  key,
  attempts: rows.length,
  arms: Object.fromEntries(
    ['legacy', 'corrected'].map((edition) => [
      edition,
      {
        touch: rows.filter((a) => a[edition]?.outcome.directReceiverTouch).length,
        control: rows.filter((a) => a[edition]?.outcome.receiverControl).length,
        retention: rows.filter((a) => a[edition]?.outcome.teamPossessionAtOneSecond).length,
        censored: rows.filter((a) => a[edition]?.outcome.censored).length,
        usefulNextAction: rows.filter((a) => a[edition]?.usefulNextAction).length,
        shotOutcomes: Object.fromEntries(
          ['goal', 'save', 'block', 'post', 'crossbar', 'miss'].map((k) => [
            k,
            rows.filter((a) => a[edition]?.outcome.originalShotOutcome === k).length,
          ]),
        ),
      },
    ]),
  ),
}));
const summary = {
  schema: 'pr208-summary-v1',
  source: sweep.receipt.source,
  inputResults: Object.fromEntries(
    [
      ['sweep', sweep],
      ['trajectories', trajectories],
      ['live', live],
    ].map(([k, v]) => [k, hash(v.receipt)]),
  ),
  scope: {
    frozenLabRows: trajectories.receipt.result.originalRows,
    frozenLiveRows: live.receipt.result.originalRows,
    launchVelocityAndSpinUnchanged: true,
    originalExactReplay: true,
    confirmation: 'sealed',
    fullMatchExperiment: 'withheld; local retention/calibration gate fails',
  },
  ground: {
    recorded: sweep.receipt.result.recorded.map((r) => ({
      vz: r.vz,
      legacyStop: r.legacy.stop.x,
      correctedStop: r.corrected.stop.x,
      firstImpact: r.corrected.firstImpact,
      lastImpact: r.corrected.lastImpact,
    })),
    sweepRows: sweep.receipt.result.rows.length,
    boundaries: sweep.receipt.result.boundaries.length,
    maxImpactEnergyGain: Math.max(
      ...sweep.receipt.result.rows.map((r) => r.corrected.maxImpactEnergyGain),
    ),
    microCost: sweep.costs.microCost,
  },
  strata,
  continuations,
  retentionChanges,
  costs: Object.fromEntries(
    [
      ['sweep', sweep],
      ['trajectories', trajectories],
      ['live', live],
    ].map(([k, v]) => [k, v.costs]),
  ),
  integration: {
    researchChange: 'event-v1 canonical ground contact, separately selected in ballEnvironment',
    localResult:
      'continuous shallow limit; retention remains mixed and shot scatter under-dispersed',
    maintainedCandidate: 'realism-candidate-v1 / PR201 unchanged',
    defaultPolicy: 'B',
    promotion: 'RETAIN_EXPERIMENTAL; ground repair available independently',
    nextDependency:
      'receiver preparation/contact-speed and one-second continuation on preserved paired deliveries; then separate empirical kick dispersion calibration',
    confirmation: 'sealed',
  },
};
const output = JSON.stringify(summary, null, 2) + '\n';
if (options.has('check'))
  assert.equal(readFileSync(`${root}/summary.json`, 'utf8'), output, 'PR208 summary drift');
else writeFileSync(`${root}/summary.json`, output, { flag: 'wx' });
console.log(
  JSON.stringify({
    source: summary.source,
    ground: summary.ground.recorded.map((r) => ({
      vz: r.vz,
      legacy: r.legacyStop,
      corrected: r.correctedStop,
    })),
    continuations: continuations
      .filter((c) => c.key.startsWith('pass/'))
      .map((c) => ({ key: c.key, ...c.arms })),
    costs: summary.costs,
  }),
);
