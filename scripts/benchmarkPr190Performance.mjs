import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
import { neutralLowerBodyPose } from '../src/core/matchSimulation/lowerBodyGeometry.ts';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const output = `docs/performance/pr190/performance-${args.get('version') ?? 'spin-final'}.json`;
if (existsSync(output)) throw Error('Preserve performance evidence');
const input = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr189/baseline-20s.json.gz')),
  ).state,
  rows = [];
for (const [name, root, observed, posed] of [
  ['baseline', args.get('baseline-root') ?? '../pr189-baseline', false, false],
  ['head', '.', false, false],
  ['head-observed', '.', true, false],
  ['head-posed', '.', false, true],
]) {
  const { stepTacticalMatchAfterDecisionProbe: step } = await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts'))
    ),
    { withBoundedObserver } = await import(
      pathToFileURL(resolve(root, 'src/core/matchSimulation/boundedIntelligence.ts'))
    );
  let state = JSON.parse(JSON.stringify(input));
  if (posed) for (const p of state.players) p.lowerBodyPose = neutralLowerBodyPose();
  for (let i = 0; i < 400; i++) state = step(state, 0.025);
  const d = new PassLifecycleDiagnostics(),
    cpu = process.cpuUsage(),
    start = performance.now();
  withBoundedObserver(observed ? (t) => d.trace(t) : undefined, () => {
    for (let i = 0; i < 8000; i++) {
      const before = state;
      state = step(state, 0.025);
      if (observed) d.observe(before, state);
    }
  });
  rows.push({
    name,
    ticks: 8000,
    cpu: process.cpuUsage(cpu),
    wallMs: performance.now() - start,
    rssBytes: process.memoryUsage().rss,
    finalStateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    seconds: state.time,
  });
}
if (rows[1].finalStateSha256 !== rows[2].finalStateSha256)
  throw Error('Observer changed continuation');
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      node: process.version,
      warmupTicks: 400,
      classification:
        'real captured development state; serial variants on shared host; baseline/posed football workloads differ; head observer states identical',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify(rows));
