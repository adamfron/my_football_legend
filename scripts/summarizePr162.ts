import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  benchmarkFileSchema,
  joinBenchmarkShards,
  joinBenchmarkSeedBlocks,
  summarizeBenchmark,
  type BenchmarkFile,
} from './formationBenchmarkSummary';

const source = resolve(process.argv.find((a) => a.startsWith('--source='))?.slice(9) ?? '..');
const out = resolve('docs/performance');
mkdirSync(out, { recursive: true });
const read = (name: string) => {
  const file = benchmarkFileSchema.parse(JSON.parse(readFileSync(resolve(source, name), 'utf8')));
  for (const result of file.results) {
    if (!result.funnel || result.funnel.version >= 3) continue;
    for (const team of Object.values(result.funnel.teams)) {
      for (const stage of ['shot', 'shot_after_final', 'shot_after_box']) delete team.stages[stage];
      team.conversions.shot_after_final = null;
      team.conversions.shot_after_box = null;
      team.conversions.sampled_shot_ranked_when_executable = null;
      if (team.events.shot_release !== undefined) {
        team.events.settled_shot_records_v1_v2 = team.events.shot_release;
        delete team.events.shot_release;
      }
    }
  }
  return file;
};
const save = (name: string, value: unknown) =>
  writeFileSync(resolve(out, name), JSON.stringify(value, null, 2) + '\n');
const compact = (file: BenchmarkFile) => ({
  ...file,
  results: file.results.map((r) => {
    const diagnostic = r.finalDiagnostics as Record<string, unknown>;
    return {
      ...r,
      finalDiagnostics: {
        ...diagnostic,
        restartLiveness: Array.isArray(diagnostic.restartLiveness)
          ? diagnostic.restartLiveness.slice(-2)
          : diagnostic.restartLiveness,
        looseBallLiveness: Array.isArray(diagnostic.looseBallLiveness)
          ? diagnostic.looseBallLiveness.slice(-2)
          : diagnostic.looseBallLiveness,
      },
    };
  }),
});
const pilot = joinBenchmarkShards(
  ['a', 'b', 'c', 'd', 'e'].map((x) => read(`PR162-pilot-v3-${x}.json`)),
);
if (!process.argv.includes('--partial') && pilot.completedMatches !== 30)
  throw new Error('Pilot incomplete');
const baseline = read('PR162-baseline.json'),
  clubs = read('PR162-clubs-v3.json');
const main = process.argv.includes('--main')
  ? joinBenchmarkSeedBlocks([
      pilot,
      joinBenchmarkShards(['a', 'b', 'c', 'd', 'e'].map((x) => read(`PR162-main-${x}.json`))),
    ])
  : undefined;
if (main && !process.argv.includes('--partial') && main.completedMatches !== 120)
  throw new Error('Main matrix incomplete');
const matrix = main ?? pilot;
const summaries = {
  pilot: summarizeBenchmark(pilot),
  main: main ? summarizeBenchmark(main) : null,
  baseline: summarizeBenchmark(baseline),
  clubs: summarizeBenchmark(clubs),
};
save('PR162-formation-pilot.json', compact(pilot));
if (main) save('PR162-formation-main.json', compact(main));
save('PR162-baseline.json', compact(baseline));
save('PR162-clubs.json', compact(clubs));
save('PR162-summary.json', summaries);
save('PR162-baseline-manifest.json', {
  ...baseline.manifest,
  completedMatches: baseline.completedMatches,
  expectedMatches: baseline.expectedMatches,
  originalObservation: JSON.parse(
    readFileSync(resolve(source, 'original-observation.json'), 'utf8'),
  ),
});
const scenariosBefore = JSON.parse(
  readFileSync(resolve(source, 'scenarios-before-valid.json'), 'utf8'),
);
const scenariosAfter = JSON.parse(
  readFileSync(resolve(source, 'PR162-final-scenarios.json'), 'utf8'),
);
save('PR162-scenarios.json', {
  before: scenariosBefore,
  after: scenariosAfter,
  sourceCommit: pilot.manifest.commit,
  caveat:
    'Rebound setup is deliberately unforced and shares the initial geometry of edge_box. Neither a save nor a corner is injected.',
});

const n = (x: unknown) => (typeof x === 'number' ? x.toFixed(2) : '—');
const table = (headers: string[], rows: unknown[][]) =>
  `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((r) => `| ${r.map((x) => (typeof x === 'number' ? n(x) : String(x))).join(' | ')} |`).join('\n')}\n`;
let report = '# PR162 canonical evidence tables\n\n';
report += `Source: \`${pilot.manifest.commit}\`; engine SHA-256 \`${pilot.manifest.engineHash}\`. `;
report += `Pilot ${pilot.completedMatches}/${pilot.expectedMatches} observed, ${summaries.pilot.fullMatches} full-time matches. Baseline ${baseline.completedMatches}/${baseline.expectedMatches}, ${summaries.baseline.fullMatches} full-time. Clubs ${clubs.completedMatches}/${clubs.expectedMatches}, ${summaries.clubs.fullMatches} full-time.\n\n`;
if (main)
  report += `Main matrix (including the unchanged pilot): ${main.completedMatches}/${main.expectedMatches} observed, ${summaries.main!.fullMatches} full-time. Formation tables below use this matrix.\n\n`;
report +=
  'All team means are per observed fixture. Capped baseline matches are censored and excluded from W/D/L and full-match seed-pair comparisons. Their partial football counts remain visible. Never compare them as full 90-minute outcomes. Mirrored orientations constitute one seed block.\n\n';
const forms = (summaries.main ?? summaries.pilot).formations;
report += '## 1. Formation matrix, anchor 4-4-2\n\n';
report += table(
  [
    'Opponent',
    'Full / observed',
    'Anchor W/D/L',
    'Anchor shots',
    'Opponent shots',
    'Paired shot Δ (95% exploratory)',
  ],
  forms.map((f) => [
    f.formation,
    `${f.completedFullMatches}/${f.matches}`,
    `${f.anchorWDL.wins}/${f.anchorWDL.draws}/${f.anchorWDL.losses}`,
    f.anchorMeans.shots,
    f.opponentMeans.shots,
    `${n(f.paired.shots!.mean)} [${f.paired.shots!.exploratory95Interval?.map(n).join(', ') ?? '—'}]`,
  ]),
);
report += '\n## 2. Attacking funnel, opponent formation\n\n';
report += table(
  [
    'Formation',
    'Controlled',
    'Advance ≥10m',
    'Sustained final third',
    'Controlled final entries',
    'Controlled box entries',
    'Credible possessions',
    'Shots',
  ],
  forms.map((f) => [
    f.formation,
    ...[
      'controlled',
      'advanced10',
      'sustainedFinal',
      'finalEntries',
      'boxEntries',
      'credible',
      'shots',
    ].map((k) => f.opponentMeans[k]),
  ]),
);
report += '\n## 3. Forward distance to the live offside line\n\n';
report += table(
  ['Formation', 'Mean gap while team possesses (m)', 'Anchor gap (m)'],
  forms.map((f) => [f.formation, f.opponentMeans.forwardLineGap, f.anchorMeans.forwardLineGap]),
);
report +=
  '\nGap is measured every 10 seconds for actual striker bodies, in attacking-direction coordinates. It is neither a tactical target nor a successful run-behind count.\n\n';
report += '## 4. Completed role passing networks\n\n';
const network: Record<string, Record<string, number>> = {};
for (const r of matrix.results) {
  const side = r.reversed ? 'home' : 'away';
  const group = (network[r.formation] ??= {});
  for (const [edge, count] of Object.entries(r.funnel!.teams[side].network))
    group[edge] = (group[edge] ?? 0) + count;
}
report += table(
  ['Formation', 'Completed role edge', 'Contacts (all fixtures)'],
  Object.entries(network).flatMap(([formation, edges]) =>
    Object.entries(edges)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([edge, count]) => [formation, edge, count]),
  ),
);
report +=
  '\nTop eight edges per formation; JSON retains every edge and exact canonical player network. Receptions use the actual receiver, including redirected deliveries.\n\n';
report += '## 5. Progressive passing and forward receptions\n\n';
report += table(
  [
    'Formation',
    'Progressive releases (>5m)',
    'Progressive completions (>5m)',
    'Striker attempts',
    'Striker receptions',
    'Through attempts / completed',
  ],
  forms.map((f) => [
    f.formation,
    ...['progressive', 'progressiveCompleted', 'strikerAttempts', 'strikerReceptions'].map(
      (k) => f.opponentMeans[k],
    ),
    `${n(f.opponentMeans.through)}/${n(f.opponentMeans.throughCompleted)}`,
  ]),
);
report += '\n## 6. Entries and physical outcomes\n\n';
report += table(
  ['Formation', 'Final third', 'Penalty area', 'Saves', 'Parries', 'Corners', 'Offsides'],
  forms.map((f) => [
    f.formation,
    ...['finalEntries', 'boxEntries', 'saves', 'parries', 'corners', 'offsides'].map(
      (k) => f.opponentMeans[k],
    ),
  ]),
);
report += '\n## 7. Turnovers and fouls by attacking pitch third\n\n';
report += table(
  [
    'Formation',
    'Own third losses',
    'Middle losses',
    'Final losses',
    'Foul zones (own / middle / final)',
  ],
  matrix.manifest.config.opponents.map((formation) => {
    const counts = { defensive: 0, middle: 0, final: 0 },
      fouls = { ...counts };
    for (const r of matrix.results.filter((r) => r.formation === formation))
      for (const [key, value] of Object.entries(
        r.funnel!.teams[r.reversed ? 'home' : 'away'].events,
      ))
        for (const zone of ['defensive', 'middle', 'final'] as const) {
          if (key.startsWith('loss_') && key.endsWith(`_${zone}`)) counts[zone] += value;
          if (key === `challenge_foul_${zone}`) fouls[zone] += value;
        }
    return [
      formation,
      counts.defensive,
      counts.middle,
      counts.final,
      `${fouls.defensive}/${fouls.middle}/${fouls.final}`,
    ];
  }),
);
report +=
  '\nCounts are whole-experiment canonical loss/challenge identities; foul zones use the committing team direction.\n\n';
report += '## 8. Actual shape and variability\n\n';
report += table(
  [
    'Formation',
    'Width (m)',
    'Depth (m)',
    'Anchor distance (m)',
    'Ideal-target distance (m)',
    'Low-progress full-turn seconds',
  ],
  forms.map((f) => [
    f.formation,
    ...['width', 'depth', 'anchorDeviation', 'targetDeviation', 'rotationSeconds'].map(
      (k) => f.opponentMeans[k],
    ),
  ]),
);
report +=
  '\nIndividual position means, standard deviations and sample counts are retained in each team spatial map. Distances are from real bodies, with explicit attacking-direction normalisation. Shape is not snapped onto targets.\n\n';
report += '## 9. Sampled available versus selected attacking actions\n\n';
report += table(
  [
    'Formation',
    'Decision samples',
    'Shot candidates',
    'Samples with executable shot',
    'Samples with shot ranked first',
    'Actual shots',
  ],
  forms.map((f) => [
    f.formation,
    ...['sampledDecisions', 'shotCandidates', 'executableShotSamples', 'shotFirst', 'shots'].map(
      (k) => f.opponentMeans[k],
    ),
  ]),
);
report +=
  '\nSamples are spaced ≥2 seconds and require a controlled owner with action cooldown ≤0. They are observations, not an exhaustive count of canonical decisions. An executable option may still have physical preparation cost.\n\n';
report += '## 10. Matched controlled situations before / after\n\n';
const beforeRows = scenariosBefore.rows as Array<{
    scenario: string;
    initial: { delay: number };
    final: { shots: number; passes: number };
  }>,
  afterRows = scenariosAfter.rows as typeof beforeRows;
report += table(
  [
    'Scenario (3 matched seeds)',
    'Delay before / after (s)',
    'Shots before / after',
    'Passes before / after',
  ],
  [...new Set(beforeRows.map((r) => r.scenario))].map((scenario) => {
    const a = beforeRows.filter((r) => r.scenario === scenario),
      b = afterRows.filter((r) => r.scenario === scenario);
    const sum = (rows: typeof a, key: 'shots' | 'passes') =>
      rows.reduce((s, r) => s + r.final[key], 0);
    return [
      scenario,
      `${n(a[0]!.initial.delay)}/${n(b[0]!.initial.delay)}`,
      `${sum(a, 'shots')}/${sum(b, 'shots')}`,
      `${sum(a, 'passes')}/${sum(b, 'passes')}`,
    ];
  }),
);
report +=
  '\nThese are 20-second scenarios, not full matches. edge_box and rebound share geometry; they are not six independent seeds.\n\n';
report += '## Conditional attacking conversions\n\n';
const ratio = (numerator: number, denominator: number) =>
  denominator
    ? `${n((100 * numerator) / denominator)}% (${numerator}/${denominator})`
    : '— (zero denominator)';
report += table(
  [
    'Formation',
    'Final entry after outside start',
    'Shot in same final-entry possession',
    'Shot in same box-entry possession',
    'First-ranked executable shot / executable samples',
  ],
  matrix.manifest.config.opponents.map((formation) => {
    const stages: Record<string, number> = {},
      events: Record<string, number> = {};
    for (const row of matrix.results.filter((r) => r.formation === formation)) {
      const team = row.funnel!.teams[row.reversed ? 'home' : 'away'];
      for (const [key, value] of Object.entries(team.stages))
        stages[key] = (stages[key] ?? 0) + value;
      for (const [key, value] of Object.entries(team.events))
        events[key] = (events[key] ?? 0) + value;
    }
    return [
      formation,
      ratio(stages.entered_from_outside ?? 0, stages.starts_outside_final ?? 0),
      ratio(stages.shot_after_final ?? 0, stages.final_entry ?? 0),
      ratio(stages.shot_after_box ?? 0, stages.box_entry ?? 0),
      ratio(events.sampled_executable_shot_ranked_first ?? 0, events.sampled_executable_shot ?? 0),
    ];
  }),
);
report +=
  '\nStages count unique controlled possessions. Set-piece releases without an open-play controlled sequence still contribute to canonical shot totals, but are outside these conditional sequence denominators. First-ranked sampled actions are distinct from actual canonical selections.\n\n';
report += '## Real squads and censored baseline\n\n';
report += table(
  [
    'Experiment',
    'Full / observed',
    'Anchor W/D/L',
    'Anchor shots / opponent',
    'Anchor passes / opponent',
  ],
  [...summaries.baseline.formations, ...summaries.clubs.formations].map((f) => [
    f.formation,
    `${f.completedFullMatches}/${f.matches}`,
    `${f.anchorWDL.wins}/${f.anchorWDL.draws}/${f.anchorWDL.losses}`,
    `${n(f.anchorMeans.shots)}/${n(f.opponentMeans.shots)}`,
    `${n(f.anchorMeans.passes)}/${n(f.opponentMeans.passes)}`,
  ]),
);
report +=
  '\nCurrent club-only rows preserve the native generated formations, starting XI and coach style. The baseline balanced/strong-weak/high-press fixture labels describe actual chosen clubs; their recorded strengths are authoritative.\n\n';
report += '## Raw orientation results\n\n';
report += table(
  [
    'Formation',
    'Seed',
    'Anchor side',
    'Status',
    'Anchor goals:opponent',
    'Anchor shots:opponent',
    'Final entries Δ',
  ],
  (summaries.main ?? summaries.pilot).metrics.map((r) => [
    r.formation,
    r.seed,
    r.reversed ? 'away' : 'home',
    r.status,
    `${r.anchor.goals}:${r.opponent.goals}`,
    `${r.anchor.shots}:${r.opponent.shots}`,
    r.anchor.finalEntries - r.opponent.finalEntries,
  ]),
);
report += `\n## Coverage limitations\n\nMain coverage: ${main?.completedMatches ?? 0}/120 observed, ${summaries.main?.fullMatches ?? 0} full-time; no missing or censored result is extrapolated. Telemetry V1 baseline does not measure progressive completion or reception beyond the release-time line as V2/V3 do. V1/V2 shot-stage conditional conversions are discarded because settlement could close possession first; canonical shot totals remain valid. Do not treat absent counters as zeros. Pressure escape duration, all cross releases, defensive line clustering, opportunity expectation at every decision and substitutions by tactical job are not fully instrumented here; canonical traces/tests and workload totals support narrower conclusions.\n`;
writeFileSync(resolve(out, 'PR162-EVIDENCE_TABLES.md'), report);
console.info(
  JSON.stringify({
    pilot: pilot.completedMatches,
    baseline: baseline.completedMatches,
    clubs: clubs.completedMatches,
    outputs: out,
  }),
);
