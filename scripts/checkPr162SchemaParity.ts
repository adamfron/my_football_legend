import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { z } from 'zod';
import { createFormationBenchmarkSession } from '../src/core/matchSimulation/benchmarkFixtures';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState';
import { TACTICAL_PREFERENCE_DEFAULTS } from '../src/core/matchSimulation/tacticalPreferences';
import {
  createTacticalMatch,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
  FIXED_MATCH_DT,
} from '../src/core/matchSimulation/matchSimulation';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';

const reference = z
  .object({
    source: z.object({ commit: z.string(), engineHash: z.string(), benchmarkHash: z.string() }),
    results: z
      .array(
        z.object({
          key: z.string(),
          initialStateHash: z.string(),
          finalStateHash: z.string(),
          ticks: z.number(),
          finalTime: z.number(),
          finalStatus: z.literal('full_time'),
        }),
      )
      .length(2),
  })
  .parse(JSON.parse(readFileSync('docs/performance/PR162-observer-parity.json', 'utf8')));
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const files: string[] = [];
const walk = (folder: string) => {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = resolve(folder, item.name);
    if (item.isDirectory()) walk(path);
    else if (path.endsWith('.ts') && !path.endsWith('.test.ts')) files.push(path);
  }
};
for (const folder of ['src/core', 'src/schemas', 'src/types']) walk(resolve(folder));
const engineHash = hash(
  files
    .sort()
    .map(
      (path) =>
        `${relative('.', path).replaceAll('\\', '/')}\0${readFileSync(path, 'utf8').replaceAll('\r\n', '\n')}\0`,
    )
    .join(''),
);
const results = reference.results.map((expected) => {
  const reversed = expected.key.endsWith(':true');
  let state = createTacticalMatch(
    createFormationBenchmarkSession({
      anchor: '4-4-2',
      opponent: '4-4-2',
      attributes: 50,
      opponentAttributes: 50,
      seed: 'pr162-1',
      reversed,
      style: 'balanced',
      normaliseDuties: false,
    }),
  );
  state.playerAgencyEnabled = false;
  for (const side of ['home', 'away'] as const) {
    state.teams[side].style = 'balanced';
    state.teams[side].tacticalPreferences = { ...TACTICAL_PREFERENCE_DEFAULTS.balanced };
  }
  tacticalMatchStateSchema.parse(state);
  const initialStateHash = hash(JSON.stringify(state));
  let ticks = 0;
  while (state.time < 7200 && !['full_time', 'abandoned'].includes(state.status ?? '')) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    ticks++;
  }
  tacticalMatchStateSchema.parse(state);
  assertMatchStatisticsInvariants(state.statistics!, state);
  const finalStateHash = hash(JSON.stringify(state));
  if (
    initialStateHash !== expected.initialStateHash ||
    finalStateHash !== expected.finalStateHash ||
    ticks !== expected.ticks ||
    state.time !== expected.finalTime ||
    state.status !== expected.finalStatus
  )
    throw new Error(`Validation-only source change altered canonical match: ${expected.key}`);
  const row = {
    ...expected,
    initialStateHash,
    finalStateHash,
    ticks,
    finalTime: state.time,
    finalStatus: state.status,
    initialAndFinalSchemasPassed: true,
    statisticsInvariantsPassed: true,
    completeCanonicalIdentity: true,
  };
  console.info(JSON.stringify(row));
  return row;
});
writeFileSync(
  'docs/performance/PR162-schema-parity.json',
  JSON.stringify(
    {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      engineHash,
      referenceSource: reference.source,
      methodology:
        'Late physical-origin schema descriptors only; two mirrored full matches must preserve complete canonical state, ticks and final time. Parsed copies are never substituted into stepping.',
      results,
    },
    null,
    2,
  ) + '\n',
);
