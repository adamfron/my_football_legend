import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import process from 'node:process';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const read = (path) => JSON.parse(gunzipSync(readFileSync(path)));
const nativePath = 'docs/performance/pr218/full-stance-v2-attempt-6.json.gz';
const native = read(nativePath);
const { summary, records } = read('docs/performance/pr219/reconstructed-pr218-attempt-6.json.gz');
assert.equal(
  summary.reference.sha256,
  createHash('sha256').update(readFileSync(nativePath)).digest('hex'),
);
assert.equal(summary.reference.fingerprint, native.source);
assert.equal(records.length, native.strikes.length);
assert.deepEqual(summary.score, native.terminal.score);
const reference = new Map(native.strikes.map((strike) => [strike.id, strike]));
const identities = new Set();
const radius = 0.145;
const results = records.map(({ pending, frames, result }) => {
  const expected = reference.get(result.id);
  assert.ok(expected && !identities.has(result.id), result.id);
  identities.add(result.id);
  for (const key of ['id', 'actorId', 'ballEpisode', 'outcome', 'reason', 'firstEvent'])
    assert.equal(result[key], expected[key], `${result.id}: ${key}`);
  for (const key of ['at', 'selectedAt', 'intendedContactAt'])
    assert.ok(Math.abs(result[key] - expected[key]) < 1e-7, `${result.id}: ${key}`);
  assert.equal(pending.id, result.id);
  const [first] = frames;
  const at = result.intendedContactAt;
  const nearest = frames.reduce((a, b) => (Math.abs(a.at - at) <= Math.abs(b.at - at) ? a : b));
  const pathLimited = pending.path.capabilityScale < 0.999999;
  const ballPointResidual = distance(nearest.ball, pending.plan.plannedBallPoint) > radius;
  return {
    outcome: result.outcome,
    pathLimited,
    ballPointResidual,
    both: pathLimited && ballPointResidual,
    neither: !pathLimited && !ballPointResidual,
    supportAbsent: frames.some((frame) => !frame.stance?.support),
    jointLimited: frames.some((frame) => frame.boot.jointLimited),
    interference: frames.some((frame) => frame.interference.length),
    preparationUnder120ms: pending.plan.preparationSeconds < 0.12,
    observationAbsentOrOver150ms: (first.observed?.observationAge ?? Infinity) > 0.15,
    nominalSampleInsideWhileAllActualSamplesOutside:
      frames.some((frame) => distance(frame.ball, frame.nominal.position) <= radius) &&
      frames.every((frame) => distance(frame.ball, frame.boot.position) > radius),
  };
});

const counts = Object.fromEntries(
  Object.entries(Object.groupBy(results, (r) => r.outcome)).map(([outcome, rows]) => {
    const conditions = Object.keys(rows[0]).filter((key) => key !== 'outcome');
    return [
      outcome,
      {
        attempts: rows.length,
        ...Object.fromEntries(
          conditions.map((condition) => [condition, rows.filter((row) => row[condition]).length]),
        ),
      },
    ];
  }),
);
assert.deepEqual(
  Object.fromEntries(Object.entries(counts).map(([key, row]) => [key, row.attempts])),
  { miss: 159, interrupted: 7, contact: 84, cancelled: 5 },
);
process.stdout.write(`${JSON.stringify({ source: native.source, counts }, null, 2)}\n`);
