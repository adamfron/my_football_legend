import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { createFootballLabProfile } from './footballLabProfile';
import { inventoryFootballAttributes } from './footballLabAttributeCoverage';
import { createFootballDrillCatalog } from '../src/core/matchSimulation/footballLabCatalog';
import {
  runFootballSkillTrial,
  type FootballSkillTrialConfig,
  type FootballSkillTrialResult,
} from '../src/core/matchSimulation/footballPerformanceLab';
import {
  labSeriesSchema,
  labSensitivitySchema,
  summariseLabMeasurements,
} from '../src/core/matchSimulation/footballLabAnalysis';
import { playerAttributesSchema } from '../src/schemas/domainSchemas';
import type { PlayerAttributes } from '../src/types/domain';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import { createTacticalMatch } from '../src/core/matchSimulation';
import { runAttributeMicroLab } from '../src/core/matchSimulation/attributeMicroLab';
import { runFitnessDrill } from '../src/core/matchSimulation/fitnessMicroLab';

const repetitions = Number(
  process.argv.find((a) => a.startsWith('--repetitions='))?.split('=')[1] ?? 30,
);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 50)
  throw new Error('Repetitions must be 1..50');
const batch = process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1] ?? 'all';
if (!['all', 'drills', 'sensitivity', 'coverage'].includes(batch)) throw new Error('Unknown batch');
const destination = 'docs/performance',
  traceDirectory = `${destination}/pr184-traces`;
mkdirSync(traceDirectory, { recursive: true });
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const write = (name: string, value: unknown) =>
  writeFileSync(`${destination}/PR184-${name}.json`, JSON.stringify(value) + '\n');
const sourceFiles = readdirSync('src/core/matchSimulation', { recursive: true })
  .filter((p): p is string => typeof p === 'string' && /\.ts$/.test(p) && !p.includes('.test.'))
  .sort();
const sourceFingerprint = () =>
  sha(
    sourceFiles
      .map(
        (p) =>
          `${p}\0${readFileSync(`src/core/matchSimulation/${p}`, 'utf8').replaceAll('\r\n', '\n')}`,
      )
      .join('\0'),
  );
const harnessFingerprint = () =>
  sha(
    [
      'scripts/benchmarkPr184.ts',
      'scripts/footballLabProfile.ts',
      'scripts/footballLabAttributeCoverage.ts',
    ]
      .map((p) => `${p}\0${readFileSync(p, 'utf8').replaceAll('\r\n', '\n')}`)
      .join('\0'),
  );
const sourceSha256 = sourceFingerprint(),
  harnessSha256 = harnessFingerprint();
const provenance = {
  baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceSha256,
  harnessSha256,
  sourceScope:
    'All non-test matchSimulation TypeScript modules; LF-normalised file path and content. Base commit fixes unchanged external dependencies.',
  harnessScope: 'Benchmark, profile fixture and type-aware attribute inventory; LF-normalised.',
  stepSeconds: 0.025,
  repetitions,
  seedPolicy:
    'pr184:<exact-config-id>:<repetition>; identical seed across attribute bands and paired profiles',
  units: { time: 's', distance: 'm', speed: 'm/s', spin: 'rad/s' },
  population:
    'One copied canonical card; all 28 attributes initially 60, right dominant, weak foot 40, height 180 cm, mass 75 kg. Repeated movement seeds are identical deterministic realizations, not independent athletes.',
};
const profile = createFootballLabProfile(),
  catalog = createFootballDrillCatalog(),
  config = (id: string) => structuredClone(catalog.find((c) => c.id === id)!);
const before = performance.now(),
  cpuBefore = process.cpuUsage();
let totalTrials = 0,
  totalTicks = 0;
const calibration: ({
    drill: string;
    overrides: Record<string, number>;
    seed: string;
  } & FootballSkillTrialResult['predictions'][number])[] = [],
  measured: Record<string, { drills: string[]; intended: boolean; effect: boolean }> = {};
const series = (
  c: FootballSkillTrialConfig,
  overrides: Record<string, number> = {},
  id = c.id,
  trace = false,
) => {
  const card = structuredClone(profile);
  for (const [attribute, value] of Object.entries(overrides)) {
    if (attribute === 'weakFootProficiency') card.weakFootProficiency = value;
    else if (attribute === 'heightCm') card.heightCm = value;
    else if (attribute === 'weightKg') card.weightKg = value;
    else card.attributes[attribute as keyof PlayerAttributes] = value;
  }
  const results: FootballSkillTrialResult[] = Array.from({ length: repetitions }, (_, i) =>
    runFootballSkillTrial(c, card, `pr184:${c.id}:${i}`),
  );
  totalTrials += results.length;
  totalTicks += results.reduce((sum, r) => sum + r.ticks, 0);
  if (trace) {
    const result = results[0]!;
    writeFileSync(`${traceDirectory}/${c.id}.json.gz`, gzipSync(JSON.stringify(result)));
  }
  const keys = [
    ...Object.keys(results[0]!.metrics),
    'peakSpeedWithBallMetresPerSecond',
    'receptionSeparationMetres',
    'timeToNextPassSeconds',
  ];
  const measuredValue = (r: FootballSkillTrialResult, key: string) => {
    if (key === 'finishSeconds') return r.finishSeconds;
    if (key === 'peakSpeedWithBallMetresPerSecond')
      return Math.max(0, ...r.samples.filter((s) => s.owner).map((s) => s.speed));
    const reception = r.events.find((e) => e.kind === 'reception');
    if (key === 'receptionSeparationMetres')
      return reception
        ? Math.max(
            0,
            ...r.samples
              .filter(
                (s) =>
                  s.at >= reception.at &&
                  (r.metrics.timeToControlSeconds === null ||
                    s.at <= r.metrics.timeToControlSeconds!),
              )
              .map((s) => s.separation),
          )
        : null;
    if (key === 'timeToNextPassSeconds') {
      const second = r.events.filter((e) => e.kind === 'release')[1];
      return second && reception ? second.at - reception.at : null;
    }
    return r.metrics[key] ?? null;
  };
  const metrics = Object.fromEntries(
    ['finishSeconds', ...keys].map((key) => [
      key,
      summariseLabMeasurements(results.map((r) => measuredValue(r, key))),
    ]),
  );
  for (const r of results)
    for (const p of r.predictions) calibration.push({ drill: c.id, overrides, seed: r.seed, ...p });
  return labSeriesSchema.parse({
    id,
    drill: c.id,
    overrides,
    samples: results.length,
    completed: results.filter((r) => r.status === 'completed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    incomplete: results.filter((r) => r.status === 'incomplete').length,
    metrics,
    trials: results.map((r) => ({
      seed: r.seed,
      inputSha256: sha(JSON.stringify({ input: r.input, seed: r.seed })),
      resultSha256: sha(JSON.stringify(r)),
      physicalSha256: sha(
        JSON.stringify({
          samples: r.samples,
          events: r.events,
          contacts: r.contacts,
          fitnessAfter: r.fitnessAfter,
        }),
      ),
      status: r.status,
      failure: r.failure,
      finishSeconds: r.finishSeconds,
      targetErrorMetres: r.metrics.targetErrorMetres,
      receptionQuality: r.metrics.receptionQuality,
      hits: r.events.filter(
        (e) =>
          e.kind === 'ball_plane' &&
          e.objectId === r.input.config.targetId &&
          e.values.hit &&
          e.values.direction === 'positive',
      ).length,
      ticks: r.ticks,
    })),
  });
};

if (batch === 'all' || batch === 'drills') {
  console.log(`Running ${catalog.length} drill configurations x ${repetitions} paired seeds`);
  write('drill-catalog', {
    ...provenance,
    baselineProfile: profile,
    configurations: catalog,
    routeLengths: catalog
      .filter((c) => c.route.length)
      .map((c) => ({
        id: c.id,
        polylineMetres: c.route.reduce(
          (sum, p, i) =>
            sum +
            Math.hypot(
              p.x - (c.route[i - 1]?.x ?? c.position.x),
              p.y - (c.route[i - 1]?.y ?? c.position.y),
            ),
          0,
        ),
        checkpoints: c.route.length,
      })),
  });
  const groups: Record<string, ReturnType<typeof series>[]> = {
    sprint: [],
    turn: [],
    slalom: [],
    pass: [],
    rebound: [],
    receive: [],
    shot: [],
  };
  for (const c of catalog) {
    groups[c.drill]!.push(series(c, {}, c.id, true));
  }
  const names: Record<string, string> = {
    sprint: 'sprint-results',
    turn: 'turning-results',
    slalom: 'slalom-results',
    pass: 'passing-accuracy',
    rebound: 'rebound-results',
    receive: 'first-touch-results',
    shot: 'shooting-results',
  };
  for (const [drill, rows] of Object.entries(groups)) write(names[drill]!, { ...provenance, rows });
  const autonomous = [];
  for (const id of [
    'shot-stationary-placed-dominant',
    'pass-20-dominant-ground',
    'wall-receive-turn',
  ]) {
    const c = config(id);
    c.id = `autonomous-${id}`;
    c.mode = 'autonomous';
    c.maximumSeconds = 10;
    autonomous.push(series(c, {}, c.id, true));
  }
  write('autonomous-results', {
    ...provenance,
    rows: autonomous,
    scope:
      'One canonical choice and its physical execution in a minimal training context; no policy ranking or receiver-completion calibration claim.',
  });
  const orientation = [];
  for (const facingAngle of [0, Math.PI / 2, Math.PI])
    for (const agility of [20, 60, 100]) {
      const c = config('505-left');
      c.facingAngle = facingAngle;
      c.id = `505-orientation-${facingAngle.toFixed(3)}`;
      orientation.push(series(c, { agility }, `${c.id}:${agility}`));
    }
  write('orientation-controls', { ...provenance, rows: orientation });
  const bodyControls = [];
  for (const [property, values] of [
    ['heightCm', [160, 180, 200]],
    ['weightKg', [60, 75, 90]],
  ] as const)
    for (const value of values)
      bodyControls.push(
        series(config('sprint-20-standing'), { [property]: value }, `${property}:${value}`),
      );
  write('body-property-controls', {
    ...provenance,
    rows: bodyControls,
    scope:
      'Exact body inputs; this sprint tests current movement dependencies, not jumping or contact strength.',
  });
  const comparison = [];
  for (const [name, pace, dribbling] of [
    ['fast-technical', 90, 90],
    ['fast-raw', 90, 20],
    ['slow-technical', 30, 90],
    ['balanced', 60, 60],
  ] as const)
    for (const spacing of [2, 4, 6])
      comparison.push(
        series(config(`slalom-${spacing}-unrestricted`), { pace, dribbling }, `${name}:${spacing}`),
      );
  write('slalom-profile-comparison', { ...provenance, rows: comparison });
}

const bands = [20, 40, 60, 80, 100];
const intended: Partial<Record<keyof PlayerAttributes, { ids: string[]; metric: string }>> = {
  pace: { ids: ['sprint-5-standing', 'sprint-30-standing'], metric: 'finishSeconds' },
  agility: { ids: ['505-left', 'sprint-5-standing'], metric: 'finishSeconds' },
  strength: { ids: ['sprint-5-standing'], metric: 'finishSeconds' },
  stamina: { ids: ['shuttle-left'], metric: 'finishSeconds' },
  dribbling: { ids: ['slalom-2-unrestricted', 'slalom-6-unrestricted'], metric: 'finishSeconds' },
  firstTouch: { ids: ['receive-18-spin-60', 'wall-receive-turn'], metric: 'receptionQuality' },
  passing: {
    ids: ['pass-10-dominant-ground', 'pass-30-dominant-ground'],
    metric: 'targetErrorMetres',
  },
  technique: {
    ids: ['pass-30-dominant-ground', 'shot-stationary-placed-dominant'],
    metric: 'targetErrorMetres',
  },
  composure: { ids: ['pass-30-dominant-ground'], metric: 'targetErrorMetres' },
  concentration: { ids: ['receive-18-spin-60'], metric: 'receptionQuality' },
  gameReading: { ids: ['pass-30-dominant-ground'], metric: 'targetErrorMetres' },
  finishing: { ids: ['shot-stationary-placed-dominant'], metric: 'targetErrorMetres' },
};
if (batch === 'all' || batch === 'sensitivity') {
  console.log('Running one-attribute experiments; five bands, exact matched starting states');
  const rows = [];
  for (const attribute of Object.keys(playerAttributesSchema.shape) as (keyof PlayerAttributes)[]) {
    const design = intended[attribute],
      ids = design?.ids ?? ['sprint-20-standing'],
      metric = design?.metric ?? 'finishSeconds';
    for (const context of ids) {
      const cells = bands.map((b) =>
        series(config(context), { [attribute]: b }, `${attribute}:${b}:${context}`),
      );
      const means = cells
        .map((c) => c.metrics[metric]!.mean)
        .filter((v): v is number => v !== null);
      const low = cells[0]!,
        high = cells.at(-1)!;
      const pairedDelta = summariseLabMeasurements(
        low.trials.map((t, i) => {
          const a =
            metric === 'finishSeconds'
              ? t.finishSeconds
              : metric === 'receptionQuality'
                ? t.receptionQuality
                : t.targetErrorMetres;
          const u = high.trials[i]!,
            b =
              metric === 'finishSeconds'
                ? u.finishSeconds
                : metric === 'receptionQuality'
                  ? u.receptionQuality
                  : u.targetErrorMetres;
          return a !== null && b !== null ? b - a : null;
        }),
      );
      const effectRange = means.length ? Math.max(...means) - Math.min(...means) : null;
      rows.push({
        attribute,
        context,
        intendedContext: Boolean(design),
        metric,
        effectRange,
        pairedDelta,
        bands: cells,
      });
      const old = measured[attribute];
      measured[attribute] = {
        drills: [...(old?.drills ?? []), context],
        intended: Boolean(design),
        effect: Boolean(old?.effect || (effectRange ?? 0) > 1e-9),
      };
    }
  }
  const interactions = [];
  for (const [name, a, b, context, metric] of [
    ['pace-agility', 'pace', 'agility', '505-left', 'finishSeconds'],
    ['pace-dribbling', 'pace', 'dribbling', 'slalom-2-unrestricted', 'finishSeconds'],
    ['dribbling-firstTouch', 'dribbling', 'firstTouch', 'slalom-2-unrestricted', 'finishSeconds'],
    ['passing-technique', 'passing', 'technique', 'pass-30-dominant-ground', 'targetErrorMetres'],
    [
      'passing-weakFoot',
      'passing',
      'weakFootProficiency',
      'pass-30-weak-ground',
      'targetErrorMetres',
    ],
    ['stamina-pace-repeated-work', 'stamina', 'pace', 'shuttle-left', 'finishSeconds'],
    [
      'finishing-technique',
      'finishing',
      'technique',
      'shot-stationary-placed-dominant',
      'targetErrorMetres',
    ],
  ]) {
    const cells = [];
    for (const x of [20, 100])
      for (const y of [20, 100])
        cells.push(series(config(context!), { [a!]: x, [b!]: y }, `${name}:${x}:${y}`));
    const means = cells.map((c) => c.metrics[metric!]!.mean),
      differenceInDifferences = means.every((m) => m !== null)
        ? means[3]! - means[2]! - means[1]! + means[0]!
        : null;
    interactions.push({ name, context, metric, differenceInDifferences, cells });
  }
  // Weak-foot proficiency is a body skill, not one of the 28 PlayerAttributes fields.
  for (const context of ['pass-30-weak-ground', 'slalom-2-weak']) {
    const metric = context.startsWith('pass') ? 'targetErrorMetres' : 'finishSeconds';
    const cells = bands.map((b) =>
      series(config(context), { weakFootProficiency: b }, `weakFoot:${b}:${context}`),
    );
    const means = cells.map((c) => c.metrics[metric]!.mean).filter((m): m is number => m !== null);
    rows.push({
      attribute: 'weakFootProficiency',
      context,
      intendedContext: true,
      metric,
      effectRange: means.length ? Math.max(...means) - Math.min(...means) : null,
      pairedDelta: summariseLabMeasurements(
        cells[0]!.trials.map((t, i) => {
          const high = cells.at(-1)!.trials[i]!,
            a = metric === 'finishSeconds' ? t.finishSeconds : t.targetErrorMetres,
            b = metric === 'finishSeconds' ? high.finishSeconds : high.targetErrorMetres;
          return a !== null && b !== null ? b - a : null;
        }),
      ),
      bands: cells,
    });
  }
  write('attribute-sensitivity', {
    ...provenance,
    ...labSensitivitySchema.parse({
      schema: 'mfl-attribute-sensitivity-v1',
      bands,
      repetitions,
      pairedSeedPolicy: provenance.seedPolicy,
      rows,
      interactions,
    }),
    unsupportedInteractions: [
      {
        name: 'strength-contact-balance',
        reason:
          'No opposing body/contact mannequin protocol in PR184. Strength sprint effects are not evidence of shielding or jumping.',
      },
    ],
  });
  write('attribute-coverage', inventoryFootballAttributes(measured));
}
if (batch === 'coverage') {
  const saved = JSON.parse(
    readFileSync(`${destination}/PR184-attribute-sensitivity.json`, 'utf8'),
  ) as {
    rows: {
      attribute: string;
      context: string;
      intendedContext: boolean;
      effectRange: number | null;
    }[];
  };
  for (const row of saved.rows) {
    const old = measured[row.attribute];
    measured[row.attribute] = {
      drills: [...(old?.drills ?? []), row.context],
      intended: row.intendedContext,
      effect: Boolean(old?.effect || (row.effectRange ?? 0) > 1e-9),
    };
  }
  write('attribute-coverage', inventoryFootballAttributes(measured));
}
if (batch === 'all') {
  const world = createCanonicalWorldDatabase(),
    state = createTacticalMatch(
      createSingleMatchSession(world, {
        homeClubId: world.clubs[0]!.id,
        awayClubId: world.clubs[1]!.id,
        seed: 'pr184-micro-reference',
        control: { mode: 'spectator' },
      }),
    );
  const micro = runAttributeMicroLab(state, {
    seed: 'pr184-existing-micro',
    repetitions: 16,
    bands: [20, 100],
  });
  const athlete = state.players.find((p) => p.slot.position === 'central_midfielder')!,
    fitness = runFitnessDrill(athlete, 'isolated_long_sprint', 8);
  write('micro-lab-reference', {
    ...provenance,
    attributeMicroLab: micro,
    fitnessMicroLab: {
      drill: 'isolated_long_sprint',
      seconds: 8,
      position: fitness.position,
      fitness: fitness.fitness,
    },
    interpretation:
      'Existing resolver/fitness references retain their definitions. ETA/quality scores are not physical exercise completion measurements.',
  });
}
if (calibration.length) {
  const grouped = new Map<string, typeof calibration>();
  for (const p of calibration) {
    const key = JSON.stringify({ drill: p.drill, overrides: p.overrides, source: p.source });
    grouped.set(key, [...(grouped.get(key) ?? []), p]);
  }
  const summaries = [...grouped].map(([key, rows]) => {
    const observed = rows.filter((r) => r.comparable && r.observed !== null && r.error !== null);
    const scaled = observed.filter((r) => (r.predictedSigma ?? 0) > 0);
    return {
      ...JSON.parse(key),
      attempts: rows.length,
      comparableObservations: observed.length,
      bias: summariseLabMeasurements(observed.map((r) => r.error)),
      rmse: observed.length
        ? Math.sqrt(observed.reduce((sum, r) => sum + r.error! ** 2, 0) / observed.length)
        : null,
      predictedSigma: summariseLabMeasurements(scaled.map((r) => r.predictedSigma!)),
      withinOneSigma: scaled.length
        ? scaled.filter((r) => Math.abs(r.error!) <= r.predictedSigma!).length / scaled.length
        : null,
      withinTwoSigma: scaled.length
        ? scaled.filter((r) => Math.abs(r.error!) <= 2 * r.predictedSigma!).length / scaled.length
        : null,
    };
  });
  write(`prediction-calibration${batch === 'all' ? '' : `-${batch}`}`, {
    ...provenance,
    summaries,
    rows: calibration,
    method:
      'Pre-kick lateral mean/sigma forecasts compared with signed sampled kick error. Conditional post-release flight forecast compared with observed target-plane radial error only without intervening contacts. Arrival-envelope ETA is not line-crossing timing. No receiver-completion probability is treated as geometric target accuracy.',
  });
}
write('real-world-reference-index', {
  accessed: '2026-10-23',
  references: [
    {
      url: 'https://pubmed.ncbi.nlm.nih.gov/17852682/',
      title: 'Ali et al. (2007), Reliability and validity of two tests of soccer skill',
      population: '24 first/second university-team and 24 third/fourth university-team players',
      measurement: 'LSPT 16 passes; reported overall times include penalties',
      reportedOverallSeconds: [43.6, 52.5],
      status: 'reference_only',
      comparability:
        'No exact LSPT/LSST reproduction; the MFL wall sequence has different geometry, scoring and familiarisation.',
    },
    {
      url: 'https://pubmed.ncbi.nlm.nih.gov/29171340/',
      title: 'Wen et al., Measurement properties and feasibility of the LSPT',
      measurement: 'Systematic review of 25 studies',
      status: 'reference_only',
      comparability: 'Reliability and population context caution; not a target quota for MFL.',
    },
    {
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11467003/',
      title:
        'Asimakidis et al. (2024), Assessment of Strength and Power Capacities in Elite Male Soccer',
      population: 'Senior professional and elite youth males over 17, kept distinct',
      measurement: 'Review of heterogeneous strength/jump protocols',
      status: 'reference_only',
      comparability: 'No jump or strength normative calibration in PR184.',
    },
    {
      url: 'https://doi.org/10.1519/JSC.0000000000001490',
      title: 'Lockie et al. (2017), A methodological report: adapting the 505',
      measurement: 'Traditional 505 described as 10 m approach plus 5 m to turn and 5 m return',
      status: 'published_geometry_only',
      comparability:
        'MFL start x20, gate x30, turn x35, return gate x30. No limb plant, footwear or familiarisation equivalence.',
    },
  ],
});
if (sourceFingerprint() !== sourceSha256 || harnessFingerprint() !== harnessSha256)
  throw new Error('Source changed during measurement');
const cpu = process.cpuUsage(cpuBefore);
write(`performance${batch === 'all' ? '' : `-${batch}`}`, {
  ...provenance,
  batch,
  context:
    process.argv.find((a) => a.startsWith('--context='))?.slice('--context='.length) ??
    'Headless process; host concurrency not controlled. CPU is process-only, wall time descriptive.',
  physicalTrials: totalTrials,
  canonicalTicks: totalTicks,
  wallSeconds: (performance.now() - before) / 1000,
  cpuSeconds: (cpu.user + cpu.system) / 1e6,
  peakRssMiB: process.resourceUsage().maxRSS / 1024,
  finalHeapMiB: process.memoryUsage().heapUsed / 1048576,
  node: process.version,
  platform: process.platform,
  cpu: os.cpus()[0]?.model,
  logicalCpus: os.cpus().length,
  includes:
    'Trials, JSON validation, SHA256 receipts, compressed traces; all batch also includes static inventory and existing micro tools. No renderer.',
});
if (!existsSync(`${destination}/PR184-verification.json`))
  write('verification', {
    status: 'pending',
    requiredCommand: 'npm run verify',
    claim: 'No claim of readiness before the full command passes.',
  });
console.log(
  JSON.stringify({
    batch,
    trials: totalTrials,
    ticks: totalTicks,
    wallSeconds: (performance.now() - before) / 1000,
    sourceSha256,
  }),
);
