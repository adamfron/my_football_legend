import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import {
  contactTacticalSummarySchema,
  transitionClockSchema,
} from '../src/core/matchSimulation/contactTacticalDiagnostics';
import {
  pressingOpportunitySchema,
  tacticalPreferencesSchema,
  tacticalSuitabilitySchema,
} from '../src/core/matchSimulation/tacticalPreferences';
import { PR158_TACTICAL_PROFILES, pr158TacticalProfileSchema } from './pr158TacticalProfiles';

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, ...value] = argument.replace(/^--/, '').split('=');
    return [key!, value.join('=')];
  }),
);
const numbers = z.record(z.string(), z.number().nonnegative().finite());
const matrixRowSchema = z.object({
  profile: z.string(),
  family: z.string(),
  seed: z.string(),
  canonicalSeconds: z.number(),
  ticks: z.number().int(),
  preferences: tacticalPreferencesSchema,
  suitability: tacticalSuitabilitySchema,
  diagnostics: numbers,
  football: numbers,
  contactTransitionsAndWorkload: contactTacticalSummarySchema,
});
const matrixSchema = z.object({
  config: z.object({ seconds: z.number().positive() }),
  canonicalSourceHash: z.string(),
  observerSourceHash: z.string(),
  results: z.array(matrixRowSchema).length(105),
});
const microRowSchema = z.object({
  profile: z.string(),
  scenario: z.string(),
  seed: z.string(),
  initialOpportunity: pressingOpportunitySchema,
  initialIntention: z.string(),
  initialPrimaryTarget: z.object({ x: z.number(), y: z.number() }),
  finalOwnerTeam: z.string(),
  statistics: numbers,
  observed: contactTacticalSummarySchema,
});
const microSchema = z.object({
  config: z.object({ seconds: z.number().positive() }),
  canonicalSourceHash: z.string(),
  observerSourceHash: z.string(),
  results: z.array(microRowSchema).length(105),
});
const before = matrixSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(args.get('before') ?? 'docs/performance/PR158-tactics-before.json'),
      'utf8',
    ),
  ),
);
const after = matrixSchema.parse(
  JSON.parse(
    readFileSync(resolve(args.get('after') ?? 'docs/performance/PR158-tactics-after.json'), 'utf8'),
  ),
);
const microBefore = microSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(args.get('micro-before') ?? 'docs/performance/PR158-tactical-scenarios-before.json'),
      'utf8',
    ),
  ),
);
const microAfter = microSchema.parse(
  JSON.parse(
    readFileSync(
      resolve(args.get('micro-after') ?? 'docs/performance/PR158-tactical-scenarios-after.json'),
      'utf8',
    ),
  ),
);
if (
  before.config.seconds !== after.config.seconds ||
  microBefore.config.seconds !== microAfter.config.seconds
)
  throw new Error('Before/after durations differ.');
if (
  new Set([
    before.observerSourceHash,
    after.observerSourceHash,
    microBefore.observerSourceHash,
    microAfter.observerSourceHash,
  ]).size !== 1
)
  throw new Error('Tactical matrices use different observer sources.');
if (
  microBefore.canonicalSourceHash !== before.canonicalSourceHash ||
  microAfter.canonicalSourceHash !== after.canonicalSourceHash
)
  throw new Error('Bounded scenarios and match matrices use different canonical sources.');
const keys = (rows: z.infer<typeof matrixRowSchema>[]) =>
  rows.map((row) => `${row.family}/${row.profile}/${row.seed}`).sort();
if (JSON.stringify(keys(before.results)) !== JSON.stringify(keys(after.results)))
  throw new Error('Tactical matrix fixtures/seeds are not paired.');
const microKeys = (rows: z.infer<typeof microRowSchema>[]) =>
  rows.map((row) => `${row.scenario}/${row.profile}/${row.seed}`).sort();
if (
  JSON.stringify(microKeys(microBefore.results)) !== JSON.stringify(microKeys(microAfter.results))
)
  throw new Error('Bounded tactical scenarios/seeds are not paired.');
if (
  [before, after].some((data) => new Set(keys(data.results)).size !== 105) ||
  [microBefore, microAfter].some((data) => new Set(microKeys(data.results)).size !== 105)
)
  throw new Error('Duplicate fixture/profile/seed rows.');
const sumRecords = (records: Record<string, number>[]) => {
  const totals: Record<string, number> = {};
  for (const record of records)
    for (const [key, value] of Object.entries(record)) totals[key] = (totals[key] ?? 0) + value;
  return totals;
};
const aggregateSchema = z.object({
  matches: z.number().int().positive(),
  canonicalSeconds: z.number().nonnegative(),
  ticks: z.number().int().nonnegative(),
  football: numbers,
  diagnostics: numbers,
  observedContacts: numbers,
  workloadBothTeams: numbers,
  sprintIntervalsBothTeams: z.array(z.number().int().nonnegative()).length(6),
  pressureByThird: z.array(z.number().int().nonnegative()).length(3),
  regainByThird: z.array(z.number().int().nonnegative()).length(3),
  turnAngles: z.array(z.number().int().nonnegative()).length(4),
  transitions: z.record(z.enum(['home', 'away']), transitionClockSchema),
  rates: z.object({
    passCompletion: z.number().min(0).max(1),
    tackleWinsPerAttempt: z.number().min(0).max(1),
    meanDefendingPresserX: z.number().min(0).max(105),
    meanEngagement: z.number().min(0).max(1),
    screenOrContainShare: z.number().min(0).max(1),
  }),
  meanSuitability: tacticalSuitabilitySchema,
});
const microAggregateSchema = z.object({
  runs: z.number().int().positive(),
  statistics: numbers,
  screenPlans: z.number().int().nonnegative(),
  engagePlans: z.number().int().nonnegative(),
  homeOwnerAtObservationEnd: z.number().int().nonnegative(),
  meanInitialEngagement: z.number().min(0).max(1),
  meanInitialSafeOutlets: z.number().nonnegative(),
  meanInitialCoverQuality: z.number().min(0).max(1),
  meanInitialRiskBehind: z.number().min(0).max(1),
  meanInitialTarget: z.object({ x: z.number(), y: z.number() }),
  observedContacts: numbers,
  workloadBothTeams: numbers,
  sprintIntervalsBothTeams: z.array(z.number().int().nonnegative()).length(6),
  transitions: z.record(z.enum(['home', 'away']), transitionClockSchema),
});
const summarySchema = z.object({
  provenance: z.record(z.string(), z.string()),
  coverage: z.object({
    profiles: z.array(z.string()).length(5),
    families: z.array(z.string()).length(7),
    seeds: z.array(z.string()).length(3),
    matrixRunsPerRevision: z.literal(105),
    boundedRunsPerRevision: z.literal(105),
    matrixNominalSecondsPerRun: z.number().positive(),
    boundedNominalSecondsPerRun: z.number().positive(),
  }),
  definitions: z.record(z.string(), z.string()),
  profileVectors: z.array(pr158TacticalProfileSchema).length(5),
  totals: z.object({ before: aggregateSchema, after: aggregateSchema }),
  byProfile: z
    .array(z.object({ profile: z.string(), before: aggregateSchema, after: aggregateSchema }))
    .length(5),
  byFamilyAndProfile: z
    .array(
      z.object({
        family: z.string(),
        profile: z.string(),
        before: aggregateSchema,
        after: aggregateSchema,
      }),
    )
    .length(35),
  boundedScenarios: z
    .array(
      z.object({ scenario: z.string(), before: microAggregateSchema, after: microAggregateSchema }),
    )
    .length(7),
  boundedByScenarioAndProfile: z
    .array(
      z.object({
        scenario: z.string(),
        profile: z.string(),
        before: microAggregateSchema,
        after: microAggregateSchema,
      }),
    )
    .length(35),
});
const sumClocks = (summaries: z.infer<typeof contactTacticalSummarySchema>[]) =>
  Object.fromEntries(
    ['home', 'away'].map((side) => {
      const totals: Record<string, number | number[]> = {};
      for (const summary of summaries)
        for (const [key, value] of Object.entries(summary.clocks[side as 'home' | 'away'])) {
          if (Array.isArray(value))
            totals[key] = value.map(
              (entry, index) => entry + ((totals[key] as number[] | undefined)?.[index] ?? 0),
            );
          else totals[key] = ((totals[key] as number | undefined) ?? 0) + value;
        }
      return [side, totals];
    }),
  );
const aggregate = (rows: z.infer<typeof matrixRowSchema>[]) => {
  const diagnostics = sumRecords(rows.map((row) => row.diagnostics));
  const football = sumRecords(rows.map((row) => row.football));
  const contactTotals = sumRecords(
    rows.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row.contactTransitionsAndWorkload).filter(
            ([, value]) => typeof value === 'number',
          ),
        ) as Record<string, number>,
    ),
  );
  const observations = rows.map((row) => row.contactTransitionsAndWorkload);
  const workloads = observations.flatMap((summary) => summary.workload);
  const sumBins = (values: number[][], size: number) =>
    Array.from({ length: size }, (_, index) =>
      values.reduce((sum, bins) => sum + (bins[index] ?? 0), 0),
    );
  return {
    matches: rows.length,
    canonicalSeconds: rows.reduce((sum, row) => sum + row.canonicalSeconds, 0),
    ticks: rows.reduce((sum, row) => sum + row.ticks, 0),
    football,
    diagnostics,
    observedContacts: contactTotals,
    workloadBothTeams: sumRecords(
      workloads.map(
        (workload) =>
          Object.fromEntries(
            Object.entries(workload).filter(([, value]) => typeof value === 'number'),
          ) as Record<string, number>,
      ),
    ),
    sprintIntervalsBothTeams: sumBins(
      workloads.map((workload) => workload.sprintIntervals),
      6,
    ),
    pressureByThird: sumBins(
      observations.map((summary) => summary.pressureByThird),
      3,
    ),
    regainByThird: sumBins(
      observations.map((summary) => summary.regainByThird),
      3,
    ),
    turnAngles: sumBins(
      observations.map((summary) => summary.turnAngles),
      4,
    ),
    transitions: sumClocks(observations),
    rates: {
      passCompletion: (football.completed ?? 0) / Math.max(1, football.passes ?? 0),
      tackleWinsPerAttempt: (football.wins ?? 0) / Math.max(1, football.attempts ?? 0),
      meanDefendingPresserX:
        (diagnostics.pressingDepth ?? 0) / Math.max(1, diagnostics.defensiveSamples ?? 0),
      meanEngagement:
        (diagnostics.plannedEngagement ?? 0) / Math.max(1, diagnostics.defensiveSamples ?? 0),
      screenOrContainShare:
        (diagnostics.screenSamples ?? 0) /
        Math.max(1, (diagnostics.screenSamples ?? 0) + (diagnostics.engageSamples ?? 0)),
    },
    meanSuitability: Object.fromEntries(
      Object.keys(rows[0]!.suitability).map((key) => [
        key,
        rows.reduce((sum, row) => sum + row.suitability[key as keyof typeof row.suitability], 0) /
          rows.length,
      ]),
    ),
  };
};
const profiles = [...new Set(after.results.map((row) => row.profile))];
const families = [...new Set(after.results.map((row) => row.family))];
const microAggregate = (rows: z.infer<typeof microRowSchema>[]) => ({
  runs: rows.length,
  statistics: sumRecords(rows.map((row) => row.statistics)),
  screenPlans: rows.filter((row) => row.initialIntention === 'screen').length,
  engagePlans: rows.filter(
    (row) => row.initialIntention === 'engage' || row.initialIntention === 'emergency',
  ).length,
  homeOwnerAtObservationEnd: rows.filter((row) => row.finalOwnerTeam === 'home').length,
  meanInitialEngagement:
    rows.reduce((sum, row) => sum + row.initialOpportunity.engagement, 0) / rows.length,
  meanInitialSafeOutlets:
    rows.reduce((sum, row) => sum + row.initialOpportunity.safeOutletCount, 0) / rows.length,
  meanInitialCoverQuality:
    rows.reduce((sum, row) => sum + row.initialOpportunity.coverQuality, 0) / rows.length,
  meanInitialRiskBehind:
    rows.reduce((sum, row) => sum + row.initialOpportunity.riskBehind, 0) / rows.length,
  meanInitialTarget: {
    x: rows.reduce((sum, row) => sum + row.initialPrimaryTarget.x, 0) / rows.length,
    y: rows.reduce((sum, row) => sum + row.initialPrimaryTarget.y, 0) / rows.length,
  },
  observedContacts: sumRecords(
    rows.map(
      (row) =>
        Object.fromEntries(
          Object.entries(row.observed).filter(([, value]) => typeof value === 'number'),
        ) as Record<string, number>,
    ),
  ),
  workloadBothTeams: sumRecords(
    rows.flatMap((row) =>
      row.observed.workload.map(
        (workload) =>
          Object.fromEntries(
            Object.entries(workload).filter(([, value]) => typeof value === 'number'),
          ) as Record<string, number>,
      ),
    ),
  ),
  sprintIntervalsBothTeams: Array.from({ length: 6 }, (_, index) =>
    rows.reduce(
      (sum, row) =>
        sum +
        row.observed.workload.reduce(
          (total, workload) => total + (workload.sprintIntervals[index] ?? 0),
          0,
        ),
      0,
    ),
  ),
  transitions: sumClocks(rows.map((row) => row.observed)),
});
const output = summarySchema.parse({
  provenance: {
    beforeCanonicalSourceHash: before.canonicalSourceHash,
    afterCanonicalSourceHash: after.canonicalSourceHash,
    observerSourceHash: after.observerSourceHash,
    microBeforeCanonicalSourceHash: microBefore.canonicalSourceHash,
    microAfterCanonicalSourceHash: microAfter.canonicalSourceHash,
  },
  coverage: {
    profiles,
    families,
    seeds: [...new Set(after.results.map((row) => row.seed))],
    matrixRunsPerRevision: 105,
    boundedRunsPerRevision: 105,
    matrixNominalSecondsPerRun: after.config.seconds,
    boundedNominalSecondsPerRun: microAfter.config.seconds,
  },
  definitions: {
    tacticalSamples: 'One-second planned tactical snapshots, not provider pressure events.',
    modeLabels:
      'Modes classify the preference/transition opportunity. A high counterpress vector can retain a counterpress label with zero engagement when safe outlets veto approach. Actual screen/engage plans and independent physical transition clocks are reported separately.',
    defendingPresserX:
      'Mean x coordinate of the nearest eligible home outfielder during sampled away control, including containment. It is a positioning proxy, not the mean height of independently recorded pressure events.',
    clocks:
      'Canonical loss→first physical pressure; loss→controlled regain; pressure→regain; regain→progression/shot/goal in separate 0-1,1-3,3-5,5-8,8-10,>10 bins. Unfinished episodes are censored.',
    microEndOwner: 'Owner team after 12 seconds, not proof of the first regain or a pressing win.',
    baselineVectors:
      'PR157 ignores new optional vector and uses mapped legacy style. Organised high press and immediate counterpress therefore share the same baseline pressing football.',
    wallTimes: 'Concurrent benchmark timings are excluded from performance conclusions.',
    workload:
      'Independent workload totals include both teams and all eligible open-play players. Football totals refer only to the profiled home team. Body contacts count resolved formal defensive challenges, excluding continuous shielding load; acceleration/deceleration counts are speed-bin crossings.',
    microPlans:
      'Initial screen/engage classifications at configured scenario start, not time-integrated tactical plan counts. Owner at end and independent pressure/regain clocks are separate outcomes.',
  },
  profileVectors: PR158_TACTICAL_PROFILES,
  totals: { before: aggregate(before.results), after: aggregate(after.results) },
  byProfile: profiles.map((profile) => ({
    profile,
    before: aggregate(before.results.filter((row) => row.profile === profile)),
    after: aggregate(after.results.filter((row) => row.profile === profile)),
  })),
  byFamilyAndProfile: families.flatMap((family) =>
    profiles.map((profile) => ({
      family,
      profile,
      before: aggregate(
        before.results.filter((row) => row.family === family && row.profile === profile),
      ),
      after: aggregate(
        after.results.filter((row) => row.family === family && row.profile === profile),
      ),
    })),
  ),
  boundedScenarios: [...new Set(microAfter.results.map((row) => row.scenario))].map((scenario) => ({
    scenario,
    before: microAggregate(microBefore.results.filter((row) => row.scenario === scenario)),
    after: microAggregate(microAfter.results.filter((row) => row.scenario === scenario)),
  })),
  boundedByScenarioAndProfile: [...new Set(microAfter.results.map((row) => row.scenario))].flatMap(
    (scenario) =>
      profiles.map((profile) => ({
        scenario,
        profile,
        before: microAggregate(
          microBefore.results.filter((row) => row.scenario === scenario && row.profile === profile),
        ),
        after: microAggregate(
          microAfter.results.filter((row) => row.scenario === scenario && row.profile === profile),
        ),
      })),
  ),
});
const out = resolve(args.get('out') ?? 'docs/performance/PR158-tactics-summary.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(output, null, 2) + '\n');
process.stdout.write(`${out}: paired 105 match rows and 105 bounded rows per revision\n`);
