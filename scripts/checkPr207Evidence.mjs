import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { hash } from './pr199Evidence.mjs';
import { checkPr207Source, BASE } from './pr207SourceGuard.mjs';
const binding = checkPr207Source(),
  root = 'docs/performance/pr207';
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const archiveSchema = z.object({
  base: z.literal(BASE),
  fingerprint: hex,
  baseline: z.record(z.string(), hex),
  manifest: z.record(z.string(), hex),
  contents: z.record(z.string(), z.string()),
  removed: z.array(z.string()),
});
for (const file of readdirSync(root).filter(
  (p) => p.startsWith('source-') && p.endsWith('.json.gz'),
)) {
  const a = archiveSchema.parse(JSON.parse(gunzipSync(readFileSync(`${root}/${file}`))));
  assert.equal(hash(a.manifest), a.fingerprint);
  const restored = { ...a.baseline };
  for (const p of a.removed) delete restored[p];
  for (const [p, content] of Object.entries(a.contents)) {
    assert.ok(!p.includes('\\') && !p.startsWith('/') && !p.split('/').includes('..'));
    restored[p] = hash(content);
  }
  assert.deepEqual(restored, a.manifest, 'Unreconstructible PR207 source');
}
const read = (mode) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/${mode}-development-v1.json.gz`)));
let kicks = 0,
  finite = 0;
for (const mode of ['lab', 'live', 'explore']) {
  const receipt = read(mode);
  assert.equal(hash(receipt.manifest), receipt.result.source);
  assert.equal(receipt.result.source, binding.fingerprint);
  const rows = receipt.result.rows;
  assert.ok(rows.length > 0);
  for (const r of rows) {
    if (mode === 'explore') continue;
    assert.equal(r.arms.length, 2);
    for (const a of r.arms) {
      kicks++;
      if (!a.released) {
        assert.equal(a.launch, null);
        continue;
      }
      const c = a.contact?.contact;
      if (!c) continue;
      finite++;
      assert.equal(c.available, true);
      assert.deepEqual(a.launch.velocity, c.outgoingVelocity);
      assert.deepEqual(a.launch.spin, c.outgoingSpin);
      const jn = c.impulse.x * c.normal.x + c.impulse.y * c.normal.y + c.impulse.z * c.normal.z;
      assert.ok(jn >= -1e-8 && jn <= c.normalImpulseLimit + 1e-8);
      const jt = Math.hypot(
        c.impulse.x - c.normal.x * jn,
        c.impulse.y - c.normal.y * jn,
        c.impulse.z - c.normal.z * jn,
      );
      assert.ok(jt <= c.tangentImpulseLimit + 1e-8);
      for (const axis of ['x', 'y', 'z']) {
        assert.ok(Number.isFinite(c.outgoingVelocity[axis]));
        assert.ok(Math.abs(c.outgoingSpin[axis]) <= 160);
        assert.ok(
          Math.abs(c.outgoingVelocity[axis] - c.incomingVelocity[axis] - c.impulse[axis] / 0.43) <
            1e-9,
        );
      }
    }
    if (r.config.delivery === 'lofted' || r.config.context === 'first_time') {
      assert.deepEqual(r.arms[0].launch, r.arms[1].launch, 'Excluded launch changed');
      assert.equal(r.arms[1].contact, null);
    }
  }
}
assert.ok(kicks > 5000 && finite > 1000, 'Independent kick corpus missing');
const summary = JSON.parse(readFileSync(`${root}/summary.json`, 'utf8'));
for (const mode of ['lab', 'live', 'explore'])
  assert.equal(summary.inputResults[mode], hash(read(mode).result));
assert.equal(summary.integration.maintainedCandidate, 'PR201');
assert.equal(summary.integration.confirmation, 'sealed');
assert.ok(
  summary.diagnostics.every(
    (d) => d.planeEllipse.diagnosticOnly && !d.planeEllipse.confidenceClaim,
  ),
);
console.log(
  `PR207 source archives, ${kicks} actual kick requests, ${finite} finite releases and excluded-route parity PASS`,
);
