import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { z } from 'zod';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { ContactTacticalTracker } from '../src/core/matchSimulation/contactTacticalDiagnostics';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, '').split('=');
    return [key!, value.join('=')];
  }),
);
const config = z
  .object({ seconds: z.number().positive().max(2700), repetitions: z.number().int().min(3) })
  .parse({
    seconds: Number(args.get('seconds') ?? 600),
    repetitions: Number(args.get('repetitions') ?? 3),
  });
const sourceRoot = resolve('src/core/matchSimulation');
const sourceHash = () => {
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? walk(path)
        : path.endsWith('.ts') && !path.endsWith('.test.ts')
          ? [path]
          : [];
    });
  const hash = createHash('sha256');
  for (const path of walk(sourceRoot).sort())
    hash
      .update(relative(sourceRoot, path).replaceAll('\\', '/'))
      .update('\0')
      .update(readFileSync(path))
      .update('\0');
  return hash.digest('hex');
};
const canonicalSourceHash = sourceHash();
const observerPath = 'src/core/matchSimulation/contactTacticalDiagnostics.ts';
const observerSourceHash = createHash('sha256').update(readFileSync(observerPath)).digest('hex');
const rowSchema = z.object({
  repetition: z.number().int(),
  enabled: z.boolean(),
  ticks: z.number().int(),
  elapsedMs: z.number(),
  observerSampledMs: z.number(),
  observerSampledCalls: z.number().int(),
  observerEstimatedMs: z.number(),
  canonicalHash: z.string(),
});
type Row = z.infer<typeof rowSchema>;
const rows: Row[] = [];
const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: 'pro_9',
  awayClubId: 'pro_1',
  seed: 'pr158-observer-cost',
  control: { mode: 'spectator' },
});
for (let repetition = 1; repetition <= config.repetitions; repetition++) {
  for (const enabled of repetition % 2 === 1 ? [false, true] : [true, false]) {
    let state = createTacticalMatch(session);
    state.playerAgencyEnabled = false;
    const tracker = enabled ? new ContactTacticalTracker() : undefined;
    let ticks = 0,
      observerSampledMs = 0,
      observerSampledCalls = 0;
    const started = performance.now();
    while (state.time < config.seconds) {
      const previous = state;
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      if (tracker) {
        if (ticks % 37 === 0) {
          const observeStarted = performance.now();
          tracker.observe(previous, state);
          observerSampledMs += performance.now() - observeStarted;
          observerSampledCalls++;
        } else tracker.observe(previous, state);
      }
      ticks++;
    }
    const elapsedMs = performance.now() - started;
    tracker?.snapshot(state);
    const canonicalHash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
    const row = rowSchema.parse({
      repetition,
      enabled,
      ticks,
      elapsedMs,
      observerSampledMs,
      observerSampledCalls,
      observerEstimatedMs: observerSampledCalls
        ? (observerSampledMs * ticks) / observerSampledCalls
        : 0,
      canonicalHash,
    });
    rows.push(row);
    assert.equal(row.canonicalHash, rows[0]!.canonicalHash, 'Observer changed canonical state');
    process.stderr.write(
      `Observer ${enabled ? 'enabled' : 'disabled'} repetition${repetition}: ${elapsedMs.toFixed(1)}ms\n`,
    );
  }
}
const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const disabled = median(rows.filter((row) => !row.enabled).map((row) => row.elapsedMs));
const enabled = median(rows.filter((row) => row.enabled).map((row) => row.elapsedMs));
if (sourceHash() !== canonicalSourceHash)
  throw new Error('Canonical source changed during observer timing; repeat this run.');
writeFileSync(
  resolve(args.get('output') ?? 'docs/performance/PR158-observer-cost.json'),
  JSON.stringify(
    {
      config,
      canonicalSourceHash,
      observerSourceHash,
      observerSourceScope: observerPath,
      methodology:
        'Current frozen canonical spectator engine, fresh state perrun; three alternated enabled/disabled pairs of the ContactTacticalTracker alone. Full-state hash parity in everyrun; sample observer calls every37ticks. No renderer/replay/DEV or export cost included. Run sequentially after competing workers finish.',
      medianDisabledMs: disabled,
      medianEnabledMs: enabled,
      elapsedChangePercent: (enabled / disabled - 1) * 100,
      canonicalParity: true,
      rows,
    },
    null,
    2,
  ) + '\n',
);
