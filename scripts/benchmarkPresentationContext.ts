import { createHash } from 'node:crypto';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatch,
} from '../src/core/matchSimulation/matchSimulation';
import { PresentationContextHistory } from '../src/app/match/tacticalRenderer/contextHistory';

const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr143-buffer-cost',
  control: { mode: 'spectator' },
});
const runSchema = z.object({
  buffered: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  canonicalSeconds: z.number().nonnegative(),
  canonicalHash: z.string(),
  samplesRetained: z.number().int().nonnegative(),
  samplesWritten: z.number().int().nonnegative(),
  sampleWorkMs: z.number().nonnegative(),
  retainedJsonBytes: z.number().int().nonnegative(),
});
const run = (buffered: boolean, ticks = 12_000) => {
  let state = createTacticalMatch(session);
  const history = new PresentationContextHistory();
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick++) {
    state = stepTacticalMatch(state, FIXED_MATCH_DT);
    if (buffered) history.observe(state);
  }
  const elapsedMs = performance.now() - started;
  const metrics = history.snapshot();
  return runSchema.parse({
    buffered,
    elapsedMs,
    canonicalSeconds: state.time,
    canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    samplesRetained: metrics.samplesRetained,
    samplesWritten: metrics.samplesWritten,
    sampleWorkMs: metrics.sampleWorkMs,
    retainedJsonBytes: Buffer.byteLength(JSON.stringify(history.leadIn(state.time, 6))),
  });
};
// Warm both paths, then alternate to expose timing noise/JIT order in the exported evidence.
run(false);
run(true);
const runs = [run(false), run(true), run(true), run(false), run(false), run(true)];
if (new Set(runs.map((r) => r.canonicalHash)).size !== 1)
  throw new Error('Context history changed canonical football');
const average = (buffered: boolean) => {
  const selected = runs.filter((r) => r.buffered === buffered);
  return selected.reduce((sum, r) => sum + r.elapsedMs, 0) / selected.length;
};
process.stdout.write(
  JSON.stringify(
    {
      seed: session.setup.seed,
      canonicalMinutes: 5,
      sampleHz: 10,
      historySeconds: 6,
      capacity: 62,
      runtime: process.version,
      runs,
      relativeWallOverheadPercent: (average(true) / average(false) - 1) * 100,
      canonicalInvariant: true,
    },
    null,
    2,
  ) + '\n',
);
