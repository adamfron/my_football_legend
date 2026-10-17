import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  tacticalMatchStateSchema,
  type TacticalMatchState,
} from '../src/core/matchSimulation/matchState';
import {
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import { pr172Manifest } from './pr172Evidence';
const stage = z
  .enum(['gate-a', 'after'])
  .parse(process.argv.find((a) => a.startsWith('--stage='))?.slice(8) ?? 'after');
const manifest = pr172Manifest();
const names = [
  'pr171-failure-false',
  'pr171-failure-true',
  'pr171-censored-central_possession-true',
  'pr171-censored-press_low-false',
] as const;
const selected =
  process.argv
    .find((a) => a.startsWith('--names='))
    ?.slice(8)
    .split(',')
    .map((n) => z.enum(names).parse(n)) ?? names;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const ordered = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(ordered)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, ordered(item)]),
        )
      : value;
for (const name of selected) {
  let state: TacticalMatchState = JSON.parse(
    gunzipSync(readFileSync(`docs/performance/pr172-states/${name}.json.gz`)).toString(),
  );
  const start = state.time,
    initialHash = hash(state),
    award = state.restart!.awardId,
    initialRequiredEnd = state.timekeeping!.requiredEndAt;
  let released: unknown = null,
    ticks = 0,
    reloadChecks = 0;
  const begun = performance.now();
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 18000) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    if (ticks % 6000 === 0) {
      const loaded = tacticalMatchStateSchema.parse(
        JSON.parse(JSON.stringify(state)),
      ) as unknown as TacticalMatchState;
      // Zod intentionally removes incidental diagnostic properties (e.g. a copied ball's
      // velocity inside a position). Compare every schema-defined next-state field.
      if (
        hash(
          ordered(tacticalMatchStateSchema.parse(stepTacticalMatchAfterDecisionProbe(loaded))),
        ) !==
        hash(ordered(tacticalMatchStateSchema.parse(stepTacticalMatchAfterDecisionProbe(state))))
      )
        throw new Error(`Reload continuation diverged: ${name}`);
      reloadChecks++;
    }
    state = stepTacticalMatchAfterDecisionProbe(state);
    ticks++;
    for (const team of ['home', 'away'] as const) {
      const active = state.players.filter((p) => p.team === team);
      if (
        active.filter(isMatchGoalkeeper).length !== 1 ||
        active.length > 11 ||
        new Set(active.map((p) => p.id)).size !== active.length
      )
        throw new Error(`Invalid roster: ${name}`);
    }
    const restart = state.restart;
    if (!released && restart && restart.awardId === award && restart.phase === 'release') {
      if (!restart.readiness?.legalReady) throw new Error('Illegal release');
      released = {
        at: state.time,
        latency: state.time - start,
        award,
        legal: restart.readiness,
        requiredEndAt: state.timekeeping!.requiredEndAt,
      };
    }
    if (ticks % 24000 === 0) console.log(`${name} ${state.time.toFixed(1)}`);
  }
  assertMatchStatisticsInvariants(state.statistics!);
  const receipt = {
    version: 1,
    manifest,
    name,
    initialHash,
    finalHash: hash(state),
    start,
    time: state.time,
    status: state.status,
    initialRequiredEnd,
    released,
    ticks,
    reloadChecks,
    score: state.score,
    statistics: state.statistics,
    wallMs: performance.now() - begun,
  };
  writeFileSync(
    `docs/performance/PR172-${stage}-recovery-${name}.json`,
    JSON.stringify(receipt, null, 2) + '\n',
  );
  if (state.status !== 'full_time' || !released) throw new Error(`Incomplete recovery: ${name}`);
  console.log(`${name} full_time ${state.time.toFixed(3)}`);
}
