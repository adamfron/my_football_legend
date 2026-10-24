import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const path = 'docs/performance/PR188-performance.json';
if (existsSync(path)) throw Error('Preserve performance receipt');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const json = (p) => JSON.parse(readFileSync(p));
const versions = ['perf-pr187', 'perf-pr188'];
const records = versions.map((version) => {
  const receiptPath = `docs/performance/PR188-labs-${version}.json`;
  const r = json(receiptPath);
  const archive = `docs/performance/PR188-traces-${version}.json.gz`;
  const trials = JSON.parse(gunzipSync(readFileSync(archive)));
  const ticks = r.rows.reduce((n, t) => n + t.canonicalTicks, 0);
  const cpuMs = (r.performance.cpu.user + r.performance.cpu.system) / 1000;
  return {
    version,
    receiptPath,
    receiptSha256: sha(readFileSync(receiptPath)),
    archive,
    archiveSha256: sha(readFileSync(archive)),
    sourceSha256: r.sourceSha256,
    runnerSha256: r.runnerSha256,
    variants: r.rows.length,
    ticks,
    cpuMs,
    cpuMillisecondsPerTick: cpuMs / ticks,
    wallMs: r.performance.wallMs,
    rssBytes: r.performance.rss,
    configurationsSha256: sha(r.rows.map((r) => r.config)),
    physicalInputsSha256: sha(
      trials.map((t) => ({
        ball: t.input.ball,
        players: t.input.players.map((p) => ({
          id: p.id,
          team: p.team,
          profile: p.profile,
          position: p.position,
          velocity: p.velocity,
          facing: p.facing,
          fitness: p.fitness,
        })),
      })),
    ),
  };
});
const result = {
  schemaVersion: 1,
  method:
    'Single serial process pair, observer-disabled 30 mirrored arrived episodes per source. Frozen PR187 engine plus the same new apparatus, followed by PR188. Complete pipeline cost, not isolated forecast-function cost; decisions and subsequent physical outcomes may differ.',
  environment: {
    node: process.version,
    platform: process.platform,
    NODE_OPTIONS: process.env.NODE_OPTIONS,
  },
  context:
    'Verification, full matrix, diagnostic replay and renderer are stopped during this pair. System/application background load and single-order warm-up uncertainty remain; no statistical speedup or peak-memory claim.',
  sameRunner: records[0].runnerSha256 === records[1].runnerSha256,
  sameConfigurations: records[0].configurationsSha256 === records[1].configurationsSha256,
  samePhysicalInputs: records[0].physicalInputsSha256 === records[1].physicalInputsSha256,
  sameTickCount: records[0].ticks === records[1].ticks,
  records,
  revisedCpuRatio: records[1].cpuMillisecondsPerTick / records[0].cpuMillisecondsPerTick,
};
writeFileSync(path, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
