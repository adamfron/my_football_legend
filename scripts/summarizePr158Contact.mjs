/* global process, console */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const args = new Map(
  process.argv.slice(2).map((value) => {
    const [key, ...parts] = value.replace(/^--/, '').split('=');
    return [key, parts.join('=')];
  }),
);
const metrics = [
  'stationaryPirouettes',
  'completeRotationLittleProgress',
  'retained',
  'passReleases',
  'attempts',
  'clean',
  'loose',
  'fouls',
  'physicalContacts',
  'meanRotationDegrees',
  'meanNetMetres',
  'meanTravelledMetres',
  'ownedSeconds',
  'exposedSeconds',
  'directionRevisions',
  'repeatedCarrySelections',
  'interruptionCensored',
];
const summarySchema = z.object({
  configuration: z.object({
    repetitions: z.number().int().positive(),
    seconds: z.number().positive(),
  }),
  sourceFingerprint: z.object({
    algorithm: z.literal('sha256'),
    scope: z.string(),
    files: z.number().int().positive(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  methodology: z.string(),
  rows: z.array(
    z.object({
      cell: z.object({ id: z.string(), context: z.string() }).passthrough(),
      duels: z.number().int().positive(),
      ...Object.fromEntries(metrics.map((key) => [key, z.number().finite().nullable()])),
    }),
  ),
});
const read = (path) => summarySchema.parse(JSON.parse(readFileSync(resolve(path), 'utf8')));
const before = read(args.get('before') ?? 'docs/performance/PR158-contact-baseline-summary.json');
const after = read(args.get('after') ?? 'docs/performance/PR158-contact-current-summary.json');
if (
  before.rows.length !== 55 ||
  after.rows.length !== 55 ||
  JSON.stringify(before.configuration) !== JSON.stringify(after.configuration) ||
  before.methodology !== after.methodology
)
  throw new Error('Expected 55 paired cells with identical configuration and measurement method.');
const rows = before.rows.map((baseline, index) => {
  const current = after.rows[index];
  if (
    JSON.stringify(baseline.cell) !== JSON.stringify(current.cell) ||
    baseline.duels !== current.duels
  )
    throw new Error(`Unpaired cell ${baseline.cell.id}.`);
  return {
    cell: baseline.cell,
    duelsPerRevision: baseline.duels,
    ...Object.fromEntries(
      metrics.map((key) => [
        key,
        {
          baseline: baseline[key],
          current: current[key],
          delta:
            baseline[key] === null || current[key] === null ? null : current[key] - baseline[key],
        },
      ]),
    ),
  };
});
const sum = (revision, key) =>
  revision.rows.some((row) => row[key] === null)
    ? null
    : revision.rows.reduce((total, row) => total + row[key], 0);
const result = {
  configuration: after.configuration,
  baselineSource: before.sourceFingerprint,
  currentSource: after.sourceFingerprint,
  methodology: after.methodology,
  totals: Object.fromEntries(
    metrics
      .filter((key) => !key.startsWith('mean'))
      .map((key) => [key, { baseline: sum(before, key), current: sum(after, key) }]),
  ),
  rows,
};
const output = resolve(args.get('output') ?? 'docs/performance/PR158-contact-paired-summary.json');
writeFileSync(output, JSON.stringify(result, null, 2));
const beforeRawPath = args.get('before-raw') ?? 'docs/performance/PR158-contact-baseline.json';
const afterRawPath = args.get('after-raw') ?? 'docs/performance/PR158-contact-current.json';
if (existsSync(resolve(beforeRawPath)) && existsSync(resolve(afterRawPath))) {
  const rawSchema = z.object({
    configuration: summarySchema.shape.configuration,
    sourceFingerprint: summarySchema.shape.sourceFingerprint,
    methodology: z.string(),
    rows: z.array(
      z.object({
        cell: z.object({ id: z.string() }).passthrough(),
        samples: z.array(z.record(z.string(), z.unknown())),
      }),
    ),
  });
  const readRaw = (path, summary) => {
    const raw = rawSchema.parse(JSON.parse(readFileSync(resolve(path), 'utf8')));
    if (
      raw.sourceFingerprint.digest !== summary.sourceFingerprint.digest ||
      JSON.stringify(raw.configuration) !== JSON.stringify(summary.configuration) ||
      raw.methodology !== summary.methodology
    )
      throw new Error('Raw contact traces and summaries must describe the same run.');
    return raw;
  };
  const beforeRaw = readRaw(beforeRawPath, before);
  const afterRaw = readRaw(afterRawPath, after);
  const selectedIds = new Set([
    'elite:roulette',
    'low:roulette',
    'context:autonomous',
    'context:push_run',
    'context:shield_front',
    'context:shield_side',
    'context:shield_back',
    'context:shield_two',
    'shield_strength:20',
    'shield_strength:95',
    'context:shield_release',
    'context:first_time_pass',
  ]);
  const traces = beforeRaw.rows
    .filter(({ cell }) => selectedIds.has(cell.id))
    .map(({ cell, samples }) => {
      const afterCell = afterRaw.rows.find((row) => row.cell.id === cell.id);
      if (!afterCell || samples.length !== afterCell.samples.length)
        throw new Error(`Missing paired trace for ${cell.id}.`);
      return { cell, repetition: 0, baseline: samples[0], current: afterCell.samples[0] };
    });
  const tracesOutput = resolve(
    args.get('traces-output') ?? 'docs/performance/PR158-contact-representative-traces.json',
  );
  writeFileSync(
    tracesOutput,
    JSON.stringify(
      {
        configuration: result.configuration,
        baselineSource: result.baselineSource,
        currentSource: result.currentSource,
        methodology: result.methodology,
        sampling:
          'Fixed paired repetition 0; body/ball trace every 0.25s. lastPhysicalContactAt and physicalContacts come from real canonical contact state/counter, not velocity inference. Six-second traces retain interruptions; initialEpisodeActive marks when motion/contact metrics have been censored.',
        rows: traces,
      },
      null,
      2,
    ),
  );
}
console.log(JSON.stringify({ output, cells: rows.length, totals: result.totals }));
