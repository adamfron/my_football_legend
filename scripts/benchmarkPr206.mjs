import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { source, hash } from './pr199Evidence.mjs';
import { runEpisode } from './pr206Episodes.mjs';

const args = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const version = args.get('version') ?? 'qualification-v1';
assert.match(version, /^[a-z0-9-]+$/);
const manifest = source(),
  started = performance.now(),
  cpu = process.cpuUsage(),
  rows = [];
for (const geometry of [0, 1, 2])
  for (const scenario of ['open', 'ablation'])
    rows.push(runEpisode({ seed: `pr206-${geometry}`, geometry, scenario }).row);
for (const scenario of ['late', 'unseen_ball', 'unseen_C', 'marked', 'wrong', 'withdrawn'])
  rows.push(runEpisode({ seed: 'pr206-negative', scenario }).row);
const result = {
  classification:
    'development qualification; deterministic constructed scenes, not independent confirmation',
  source: hash(manifest),
  rows,
};
assert.deepEqual(source(), manifest, 'Source changed during qualification');
const costs = {
  wallSeconds: (performance.now() - started) / 1000,
  cpuSeconds: Object.values(process.cpuUsage(cpu)).reduce((a, b) => a + b, 0) / 1e6,
  peakRSSKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: process.platform,
};
const output = `docs/performance/pr206/${version}.json.gz`;
if (args.has('check'))
  assert.equal(hash(JSON.parse(gunzipSync(readFileSync(output))).result), hash(result));
else {
  mkdirSync('docs/performance/pr206', { recursive: true });
  writeFileSync(output, gzipSync(JSON.stringify({ manifest, result, costs }), { level: 9 }), {
    flag: 'wx',
  });
}
console.log(
  JSON.stringify({
    output,
    costs,
    rows: rows.map((r) => ({
      config: r.config,
      qualifies: r.qualifies,
      clocks: r.clocks,
      outcomes: r.outcomes.map((o) => o.outcome),
    })),
  }),
);
