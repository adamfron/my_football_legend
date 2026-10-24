import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
const args = new Map(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const engineRoot = args.get('engine-root') ?? '.',
  name = args.get('name') ?? 'current';
const output = `docs/performance/pr189/performance-${name}.json`;
if (existsSync(output)) throw Error('Preserve performance evidence');
const { stepTacticalMatchAfterDecisionProbe: step } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts'))
);
const receipt = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const initial = JSON.parse(gunzipSync(readFileSync(receipt.archive))).input;
let state = JSON.parse(JSON.stringify(initial));
for (let i = 0; i < 400; i++) state = step(state, 0.025);
const before = process.cpuUsage(),
  start = performance.now();
for (let i = 0; i < 8000; i++) state = step(state, 0.025);
const result = {
  schemaVersion: 1,
  name,
  node: process.version,
  ticks: 8000,
  stepSeconds: 0.025,
  classification:
    'same frozen initial WW/A input, 400 warmup ticks; divergent football workloads; observer off; shared host',
  cpu: process.cpuUsage(before),
  wallMs: performance.now() - start,
  rssBytes: process.memoryUsage().rss,
  finalStateSha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
};
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
