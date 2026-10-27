import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { planBallOrientedMovement } from '../src/core/matchSimulation/ballOrientedMovement.ts';
import { planSynchronizedReception } from '../src/core/matchSimulation/receiverSynchronisation.ts';
import { args, read, hash, sourceIdentity, finish } from './pr198Evidence.mjs';
const options = args(),
  identity = sourceIdentity(),
  mode = options.get('mode') ?? 'serial',
  version = options.get('version') ?? 'v1';
if (!['serial', 'concurrent-1', 'concurrent-2'].includes(mode)) throw Error('Unknown profile mode');
const frozen = read('docs/performance/pr198/releases-v1.json.gz').result.rows;
const source = read('docs/performance/pr198/receptions-combined-v1.json.gz').result.rows;
const cases = source
  .flatMap((row) => {
    const f = frozen.find(
      (r) => r.family === row.family && r.skill === row.skill && r.sample === row.sample,
    );
    const frame = row.frames?.find((f) => f.observation?.ball && f.legacyLocalPlan?.nextContact);
    if (!frame) return [];
    const actor = {
      ...f.state.players.find((p) => p.id === f.contract.receiverId),
      position: frame.position,
      velocity: frame.velocity,
      facingAngle: frame.facing,
      plantBalance: frame.plantBalance ?? undefined,
      target: frame.target,
    };
    return [{ actor, observation: frame.observation, at: frame.at }];
  })
  .slice(0, 12);
const results = [];
for (const model of ['legacy', 'synchronized']) {
  const outputs = [],
    cpu = process.cpuUsage(),
    started = performance.now();
  for (let repeat = 0; repeat < 20; repeat++)
    for (const c of cases)
      outputs.push(
        model === 'legacy'
          ? planBallOrientedMovement(c.actor, c.observation, c.at, c.actor.target, 'receive', c.at)
          : planSynchronizedReception(c.actor, c.observation, c.at, c.at),
      );
  results.push({
    model,
    calls: outputs.length,
    wallMilliseconds: performance.now() - started,
    cpu: process.cpuUsage(cpu),
    outputHash: hash(outputs),
    maximumProbes: model === 'synchronized' ? Math.max(...outputs.map((o) => o.probes)) : null,
    costQualification:
      'One profile process in serial mode; two identical processes in concurrent modes. Other development jobs may compete on the host. No full-match speed ratio inferred.',
  });
}
// Timing is deliberately outside the deterministic result comparison.
finish(
  `docs/performance/pr198/performance-${mode}-${version}.json`,
  {
    schema: 'pr198-profile-v1',
    source: identity,
    mode,
    cases: cases.length,
    outputs: results.map(({ model, calls, outputHash, maximumProbes }) => ({
      model,
      calls,
      outputHash,
      maximumProbes,
    })),
    bounds: {
      localSamplePasses: 2,
      samplesPerPass: 25,
      maximumLocalSamples: 50,
      bodyProbes: 3,
      maximumBodyStepsPerProbe: 96,
      planningHz: 10,
      canonicalHz: 40,
    },
  },
  {
    rows: results,
    maxRSSKiB: process.resourceUsage().maxRSS,
    memory: process.memoryUsage(),
    node: process.version,
    cpu: cpus()[0]?.model,
  },
);
console.log(mode, JSON.stringify(results));
