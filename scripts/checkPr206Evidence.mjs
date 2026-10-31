import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { z } from 'zod';
import { checkPr206Source, BASE } from './pr206SourceGuard.mjs';
import { hash } from './pr199Evidence.mjs';
const root = 'docs/performance/pr206',
  binding = checkPr206Source();
const read = (name) => JSON.parse(gunzipSync(readFileSync(`${root}/${name}.json.gz`)));
const receiptSchema = z.object({
  manifest: z.record(z.string(), z.string()),
  result: z
    .object({
      source: z.string(),
      rows: z
        .array(
          z
            .object({
              config: z.object({ scenario: z.string() }).passthrough(),
              qualifies: z.boolean(),
            })
            .passthrough(),
        )
        .optional(),
    })
    .passthrough(),
  costs: z.object({
    wallSeconds: z.number().nonnegative(),
    cpuSeconds: z.number().nonnegative(),
    peakRSSKiB: z.number().positive(),
    node: z.string(),
    platform: z.string(),
  }),
});
for (const file of readdirSync(root).filter(
  (n) => n.startsWith('source-') && n.endsWith('.json.gz'),
)) {
  const archive = JSON.parse(gunzipSync(readFileSync(`${root}/${file}`)));
  assert.equal(archive.base, BASE);
  assert.equal(hash(archive.manifest), archive.fingerprint);
  const prior = JSON.parse(
      readFileSync('docs/performance/pr205/current-source.json', 'utf8'),
    ).manifest,
    restored = { ...prior };
  for (const [path, content] of Object.entries(archive.contents)) {
    assert.ok(!path.split('/').includes('..') && !path.includes('\\') && !path.startsWith('/'));
    restored[path] = hash(content);
  }
  assert.deepEqual(restored, archive.manifest, 'Unreconstructible source archive');
}
const q = read('qualification-final'),
  f = read('factorial-final');
receiptSchema.parse(q);
for (const r of [q, f]) {
  assert.equal(r.result.source, hash(r.manifest));
  assert.equal(r.result.source, binding.fingerprint);
}
assert.equal(f.result.qualificationHash, hash(q.result));
const opens = q.result.rows.filter((r) => r.config.scenario === 'open');
assert.equal(opens.length, 3);
assert.ok(opens.every((r) => r.qualifies));
assert.ok(q.result.rows.some((r) => !r.qualifies));
for (const r of opens) {
  assert.ok(r.clocks.aRelease - r.clocks.command >= 0.05 - 1e-7);
  assert.ok(r.commands.some((c) => c.prospectiveMotor));
}
assert.equal(q.result.rows.find((r) => r.config.scenario === 'unseen_ball').clocks.command, null);
assert.equal(q.result.rows.find((r) => r.config.scenario === 'late').qualifies, false);
const wrong = q.result.rows.find((r) => r.config.scenario === 'wrong');
assert.notEqual(wrong.requests[0].predictedIntermediary, wrong.requests[0].receiverId);
assert.ok(wrong.frames.some((f) => f.job?.prospective?.status === 'withdrawn'));
const unseen = q.result.rows.find((r) => r.config.scenario === 'unseen_C');
assert.ok(
  unseen.decisions
    .filter((d) => d.actorId === unseen.ids.b)
    .every(
      (d) =>
        !d.candidates?.some(
          (c) => c.action.type === 'pass' && c.action.receiverId === unseen.ids.c,
        ),
    ),
);
const byCase = new Map();
for (const r of f.result.rows) {
  const key = JSON.stringify([r.family, r.sample, r.window]);
  if (!byCase.has(key)) byCase.set(key, []);
  byCase.get(key).push(r);
}
for (const quartet of byCase.values()) {
  assert.equal(quartet.length, 4);
  assert.equal(new Set(quartet.map((r) => r.ballHash)).size, 1);
  assert.equal(new Set(quartet.map((r) => r.releaseHash)).size, 1);
  assert.equal(new Set(quartet.map((r) => hash(r.prelude.initialBody))).size, 1);
}
assert.ok(f.result.execution.length > 0, 'Matched physical execution is required');
for (const r of f.result.execution) {
  assert.equal(r.arms.length, 8);
  assert.equal(new Set(r.arms.map((a) => a.ballHash)).size, 1);
  assert.equal(new Set(r.arms.map((a) => hash(a.body))).size, 1);
}
if (process.argv.includes('--replay')) {
  assert.equal(process.platform, q.costs.platform, 'Exact replay requires recorded platform');
  assert.equal(process.version, q.costs.node, 'Exact replay requires recorded Node');
  for (const [script, version, args] of [
    ['benchmarkPr206', 'qualification-final', []],
    ['benchmarkPr206Factorial', 'factorial-final', ['--qualification=qualification-final']],
  ])
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerPr206Lab.mjs',
        `scripts/${script}.mjs`,
        `--version=${version}`,
        '--check',
        ...args,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
}
console.log(
  `PR206 source archives, genuine commands, negative controls, ${byCase.size} frozen quartets and ${f.result.execution.length} matched contact checkpoints PASS`,
);
