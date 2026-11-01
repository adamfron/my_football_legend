import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { z } from 'zod';
import { hash } from './pr199Evidence.mjs';
import { checkPr210Source } from './pr210SourceGuard.mjs';
const root = 'docs/performance/pr210',
  binding = checkPr210Source();
const read = (p) =>
  JSON.parse(p.endsWith('.gz') ? gunzipSync(readFileSync(p)) : readFileSync(p, 'utf8'));
const receiptSchema = z
  .object({
    arm: z.enum(['before', 'after']),
    resultHash: z.string(),
    result: z
      .object({
        physicalHash: z.string(),
        physical: z.array(z.unknown()),
        rows: z.array(
          z
            .object({
              name: z.string(),
              prematurePrompts: z.number().int().nonnegative(),
              frames: z
                .array(
                  z
                    .object({
                      time: z.number(),
                      footDistance: z.number().nonnegative(),
                      footReach: z.number().positive(),
                      readiness: z.object({ ready: z.boolean() }),
                      decision: z.object({ kind: z.string() }).optional(),
                    })
                    .passthrough(),
                )
                .min(1),
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    performance: z
      .object({
        wallSeconds: z.number().positive(),
        cpuSeconds: z.number().nonnegative(),
        peakRSSKiB: z.number().positive(),
      })
      .passthrough(),
  })
  .passthrough();
const before = read(`${root}/before.json.gz`),
  after = read(`${root}/after.json.gz`);
receiptSchema.parse(before);
receiptSchema.parse(after);
for (const r of [before, after]) assert.equal(hash(r.result), r.resultHash);
assert.equal(
  before.result.physicalHash,
  after.result.physicalHash,
  'Shared body/ball executor changed',
);
assert.equal(hash(after.result.physical), after.result.physicalHash);
assert.equal(
  before.result.rows.reduce((n, r) => n + r.prematurePrompts, 0),
  5,
);
assert.equal(
  after.result.rows.reduce((n, r) => n + r.prematurePrompts, 0),
  0,
);
for (const row of after.result.rows)
  for (const frame of row.frames)
    if (frame.decision?.kind === 'on_ball') {
      assert.ok(frame.readiness.ready);
      assert.ok(frame.footDistance <= frame.footReach);
    }
const archive = read(`${root}/source-${binding.fingerprint}.json.gz`),
  restored = { ...archive.baseline };
for (const p of archive.removed) delete restored[p];
for (const [p, content] of Object.entries(archive.contents)) restored[p] = hash(content);
assert.deepEqual(restored, binding.manifest);
if (process.argv.includes('--replay')) {
  mkdirSync('.benchmark-artifacts', { recursive: true });
  const path = '.benchmark-artifacts/pr210-replay.json.gz';
  execFileSync(
    process.execPath,
    [
      '--experimental-transform-types',
      '--import',
      './scripts/registerTypescriptLoader.mjs',
      'scripts/benchmarkPr210.mjs',
      `--output=${path}`,
    ],
    { stdio: 'inherit', windowsHide: true },
  );
  assert.equal(read(path).resultHash, after.resultHash);
}
console.log('PR210 source, physical parity, paired agency evidence and negative cases PASS');
