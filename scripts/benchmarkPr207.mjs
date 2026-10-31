import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import { runPair } from './pr207Experiments.mjs';
import { createKickFixture } from '../src/core/matchSimulation/physicalKickLaboratory.ts';
import { executePhysicalKick } from '../src/core/matchSimulation/kickExecution.ts';
import { deriveAerialLaunchPlan } from '../src/core/matchSimulation/ballPhysics.ts';
import { flight } from './pr207Experiments.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const mode = args.get('mode') ?? 'lab';
const n = Number(args.get('samples') ?? (mode === 'live' ? 6 : 64));
assert.ok(['lab', 'live', 'explore'].includes(mode));
assert.ok(Number.isInteger(n) && n > 0 && n <= 256);
const manifest = source(),
  start = performance.now(),
  cpu = process.cpuUsage();
const rows = [];
if (mode === 'lab') {
  for (const metres of [10, 35, 45])
    for (const primary of [25, 90])
      for (const technique of [25, 90])
        for (let sample = 0; sample < n; sample++)
          rows.push(
            runPair({ seed: `pr207-pass-${sample}`, family: 'pass', metres, primary, technique }),
          );
  for (const context of ['open', 'moderate', 'immediate', 'hurried', 'first_time'])
    for (let sample = 0; sample < n; sample++)
      rows.push(runPair({ seed: `pr207-pressure-${sample}`, family: 'pass', metres: 20, context }));
  for (const primary of [25, 90])
    for (const technique of [25, 90])
      for (const intent of ['placed', 'driven'])
        for (const context of ['open', 'immediate', 'first_time'])
          for (let sample = 0; sample < n; sample++)
            rows.push(
              runPair({
                seed: `pr207-shot-${sample}`,
                family: 'shot',
                metres: 20,
                primary,
                technique,
                intent,
                context,
              }),
            );
  // Actual canonical lofts stay historical: their unchanged result is an audited dependency.
  for (const metres of [30, 45])
    for (let sample = 0; sample < n; sample++)
      rows.push(
        runPair({ seed: `pr207-loft-${sample}`, family: 'pass', metres, delivery: 'lofted' }),
      );
} else if (mode === 'live') {
  for (const family of ['pass', 'shot'])
    for (const context of ['open', 'moderate', 'immediate', 'hurried', 'first_time'])
      for (let sample = 0; sample < n; sample++)
        rows.push(
          runPair({ seed: `pr207-live-${family}-${sample}`, family, metres: 20, context }, true),
        );
} else {
  for (const kind of ['pass', 'long_pass', 'cross', 'driven_cross'])
    for (const metres of [30, 45])
      for (let sample = 0; sample < n; sample++) {
        const f = createKickFixture({ seed: `pr207-explore-${sample}`, metres });
        const target = { x: f.state.ball.x + metres, y: 34 };
        const nominal = deriveAerialLaunchPlan(f.state.ball, target, kind, {
          ability: 70,
          maximumSpeed: 30,
        });
        const request = {
          family: 'pass',
          target,
          nominalVelocity: nominal.velocity,
          surface: 'inside',
        };
        const clean = executePhysicalKick(f.state, f.actor, request, {
          lateralPatchMetres: 0,
          verticalPatchMetres: 0,
          timingSeconds: 0,
          effortError: 0,
        });
        const actual = executePhysicalKick(f.state, f.actor, request);
        rows.push({
          kind,
          metres,
          sample,
          scope: 'isolated solver exploration; no live aerial consumer enabled',
          nominal,
          clean,
          actual,
          nominalFlight: flight(
            { ...f.state.ball, velocity: nominal.velocity, airborne: true },
            target,
            f.actor,
          ),
          realisedFlight: flight(
            {
              ...f.state.ball,
              velocity: actual.contact.outgoingVelocity,
              spin: actual.contact.outgoingSpin,
              airborne: true,
            },
            target,
            f.actor,
          ),
        });
      }
}
const result = {
  classification:
    'constructed independent-seed development kicks; paired attributes/context, no independent confirmation',
  mode,
  n,
  source: hash(manifest),
  rows,
};
assert.deepEqual(source(), manifest, 'Source changed during PR207 experiment');
const costs = {
  wallSeconds: (performance.now() - start) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((s, n) => s + n, 0) / 1e6,
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const version = args.get('version') ?? 'development-v1';
assert.match(version, /^[a-z0-9-]+$/);
const output = `docs/performance/pr207/${mode}-${version}.json.gz`;
if (args.has('check'))
  assert.equal(
    hash(JSON.parse(gunzipSync(readFileSync(output))).result),
    hash(result),
    'PR207 exact replay drift',
  );
else {
  mkdirSync('docs/performance/pr207', { recursive: true });
  writeFileSync(output, gzipSync(JSON.stringify({ manifest, result, costs }), { level: 9 }), {
    flag: 'wx',
  });
}
console.log(
  JSON.stringify({ output, kicks: mode === 'explore' ? rows.length : rows.length * 2, costs }),
);
