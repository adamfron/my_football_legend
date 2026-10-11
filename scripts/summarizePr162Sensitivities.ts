import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  benchmarkFileSchema,
  descriptive,
  summarizeBenchmark,
  validateFunnelAccounting,
} from './formationBenchmarkSummary';

const read = (name: string) =>
  benchmarkFileSchema.parse(JSON.parse(readFileSync(resolve('..', name), 'utf8')));
const archiveOut = resolve('../PR162-evidence');
mkdirSync(archiveOut, { recursive: true });
const fullAbility = read('PR162-ability-final.json');
const withoutObserver = read('PR162-parity-final-no-observer.json');
const observed = read('PR162-pilot-v3-c.json');
const nativeDuties = read('PR162-duty-native-final.json');
const normalisedDuties = read('PR162-duty-normalised-final.json');
const abilities = ['50-50', '60-50', '70-50', '80-60', '50-70'].map((level) => ({
  level,
  file: read(`PR162-ability-${level}-final.json`),
}));
const files = [
  fullAbility,
  withoutObserver,
  nativeDuties,
  normalisedDuties,
  ...abilities.map((a) => a.file),
];
for (const file of files) {
  if (file.completedMatches !== file.expectedMatches) throw new Error('Sensitivity incomplete');
  const { commit, engineHash, benchmarkHash } = file.manifest;
  if (
    commit !== observed.manifest.commit ||
    engineHash !== observed.manifest.engineHash ||
    benchmarkHash !== observed.manifest.benchmarkHash
  )
    throw new Error('Sensitivity source differs');
  if (
    file.manifest.config.minutes === 90 &&
    file.results.some((r) => r.finalStatus !== 'full_time')
  )
    throw new Error('Full-match sensitivity did not reach the final whistle');
}
const parity = withoutObserver.results.map((row) => {
  const withObserver = observed.results.find((candidate) => candidate.key === row.key);
  if (
    !withObserver ||
    row.fixtureHash !== withObserver.fixtureHash ||
    row.initialStateHash !== withObserver.initialStateHash ||
    row.stateHash !== withObserver.stateHash ||
    row.finalTime !== withObserver.finalTime ||
    row.ticks !== withObserver.ticks
  )
    throw new Error(`Full-state observer parity failed: ${row.key}`);
  return {
    key: row.key,
    fixtureHash: row.fixtureHash,
    initialStateHash: row.initialStateHash,
    finalStateHash: row.stateHash,
    ticks: row.ticks,
    finalTime: row.finalTime,
    finalStatus: row.finalStatus,
  };
});
writeFileSync(
  'docs/performance/PR162-observer-parity.json',
  JSON.stringify(
    {
      source: observed.manifest,
      fullMatchesCompared: parity.length,
      completeCanonicalStateEqual: true,
      results: parity,
    },
    null,
    2,
  ) + '\n',
);
const evidence = {
  source: observed.manifest,
  methodology:
    'Ability windows and duty windows are 600 seconds, not full matches. The separate 70/50 experiment and observer parity are full matches. Both orientations share one seed block; no monotonic win-rate conclusion is supported. Uninstrumented first-touch quality and intrinsic pass difficulty are unknown, not zero.',
  fullAbility,
  nativeDuties,
  normalisedDuties,
  abilities,
  accounting: files
    .filter((f) => f.manifest.config.observer)
    .map((f) => ({
      config: f.manifest.config,
      checks: validateFunnelAccounting(f),
    })),
};
writeFileSync(
  resolve(archiveOut, 'PR162-sensitivities.json.gz'),
  gzipSync(JSON.stringify(evidence) + '\n'),
);
const n = (value: number | null | undefined) =>
  typeof value === 'number' ? value.toFixed(2) : '—';
const table = (headers: string[], rows: unknown[][]) =>
  `| ${headers.join(' | ')} |\n| ${headers.map(() => '---').join(' | ')} |\n${rows.map((row) => `| ${row.join(' | ')} |`).join('\n')}\n`;
let report = '# PR162 ability, duty and actual-squad evidence\n\n';
report += `Source: \`${observed.manifest.commit}\`. All windows run through canonical physics. Zero recorded outcomes and unknown mechanisms remain distinct.\n\n`;
report += '## Ability sensitivity, mirrored ten-minute windows\n\n';
report += table(
  [
    'Anchor/opponent attributes',
    'Passes',
    'Completion %',
    'Progressive completions',
    'Box entries',
    'Shots',
    'Tackle wins',
    'Distance m',
  ],
  abilities.map(({ level, file }) => {
    const f = summarizeBenchmark(file).formations[0]!;
    const a = f.anchorMeans,
      b = f.opponentMeans;
    const pair = (key: keyof typeof a) => `${n(a[key])}/${n(b[key])}`;
    return [
      level,
      pair('passes'),
      `${n(a.passCompletion === null ? null : a.passCompletion * 100)}/${n(b.passCompletion === null ? null : b.passCompletion * 100)}`,
      pair('progressiveCompleted'),
      pair('boxEntries'),
      pair('shots'),
      pair('tackleWins'),
      pair('distance'),
    ];
  }),
);
const full = summarizeBenchmark(fullAbility).formations[0]!;
report += `\nThe separate full 70/50 experiment completes ${full.completedFullMatches}/2 matches: anchor W/D/L ${full.anchorWDL.wins}/${full.anchorWDL.draws}/${full.anchorWDL.losses}, shots ${n(full.anchorMeans.shots)}/${n(full.opponentMeans.shots)}. This is one mirrored seed, not a quality ranking.\n\n`;
report += '## Native duties versus all-support duties, ten-minute windows\n\n';
report += table(
  [
    'Duties',
    'Opponent formation',
    'Anchor/opponent progressive completions',
    'Box entries',
    'Shots',
    'Forward line gap m',
  ],
  [nativeDuties, normalisedDuties].flatMap((file) =>
    summarizeBenchmark(file).formations.map((f) => {
      const a = f.anchorMeans,
        b = f.opponentMeans;
      const pair = (key: keyof typeof a) => `${n(a[key])}/${n(b[key])}`;
      return [
        file.manifest.config.normaliseDuties ? 'all support' : 'native',
        f.formation,
        pair('progressiveCompleted'),
        pair('boxEntries'),
        pair('shots'),
        pair('forwardLineGap'),
      ];
    }),
  ),
);
report +=
  '\nDuty changes alter trajectories and passing, but these short windows cannot attribute a full-match advantage or solve shot creation.\n\n';
const roleSchema = z.object({
  role: z.string(),
  count: z.number(),
  effectiveOverall: z.number(),
  meanCondition: z.number(),
  attributes: z.record(z.string(), z.number()),
});
const profiles = z
  .object({
    teams: z.array(
      z.object({
        name: z.string(),
        storedClubRating: z.number(),
        squadAveragePrimaryOverall: z.number(),
        selectedXIRating: z.number(),
        formation: z.string(),
        meanCondition: z.number(),
        benchCount: z.number(),
        benchMeanCondition: z.number(),
        groups: z.array(roleSchema),
      }),
    ),
  })
  .parse(JSON.parse(readFileSync('docs/performance/PR162-club-profiles.json', 'utf8')));
report += '## Three distinct native squad ratings\n\n';
report += table(
  [
    'Club',
    'Stored club rating',
    'Selected XI',
    'Whole-squad primary OVR',
    'Formation',
    'XI condition',
    'Bench count/condition',
  ],
  profiles.teams.map((t) => [
    t.name,
    t.storedClubRating,
    t.selectedXIRating,
    n(t.squadAveragePrimaryOverall),
    t.formation,
    n(t.meanCondition),
    `${t.benchCount}/${n(t.benchMeanCondition)}`,
  ]),
);
report +=
  '\nThe current sandbox displays selected-XI strength as OVR XI and the whole-squad primary-position average as OVR kadr. Thus 79/72 and 75.79/68.50 are different projections. Native coach formation/style defaults are recorded; no extra individual-manager personality is claimed.\n\n';
report += '## Effective role quality in the selected XI\n\n';
report += table(
  ['Club', 'Role', 'Count', 'Effective OVR', 'Condition'],
  profiles.teams.flatMap((t) =>
    t.groups.map((g) => [t.name, g.role, g.count, n(g.effectiveOverall), n(g.meanCondition)]),
  ),
);
report +=
  '\nEvery role attribute mean is retained in PR162-club-profiles.json. Exact XI/bench identities, full profiles and tactics remain in the complete local club archive.\n\n';
const reboundSchema = z.object({
  sourceCommit: z.string(),
  scenarioSourceHash: z.string(),
  results: z.array(
    z.object({
      seed: z.string(),
      distance: z.number(),
      intent: z.string(),
      initialHash: z.string(),
      reboundAttackerOnsideAtFirstShot: z.literal(true),
      firstOutcome: z
        .object({ outcome: z.string(), goalkeeperAction: z.string().optional() })
        .nullable(),
      sameAttackFollowUps: z.number(),
      followUpReleases: z.array(
        z.object({ afterSaveSeconds: z.number().nullable(), sameAttackAfterSave: z.boolean() }),
      ),
    }),
  ),
});
const reboundsBefore = reboundSchema.parse(
  JSON.parse(readFileSync('../PR162-rebounds-before.json', 'utf8')),
);
const reboundsAfter = reboundSchema.parse(
  JSON.parse(readFileSync('../PR162-rebounds-final.json', 'utf8')),
);
if (
  reboundsBefore.scenarioSourceHash !== reboundsAfter.scenarioSourceHash ||
  reboundsBefore.results.length !== reboundsAfter.results.length ||
  reboundsBefore.results.some(
    (row, index) => row.initialHash !== reboundsAfter.results[index]!.initialHash,
  )
)
  throw new Error('Rebound requests are not matched frozen states');
report += '## Requested shot, endogenous save and same-attack follow-up\n\n';
report += table(
  [
    'Source',
    'Requested initial shots',
    'First-shot saves',
    'First-shot parries',
    'Same-attack follow-up shots',
    'Mean save-to-follow-up seconds',
  ],
  [reboundsBefore, reboundsAfter].map((file) => [
    file.sourceCommit.slice(0, 7),
    file.results.length,
    file.results.filter((r) => r.firstOutcome?.outcome === 'save').length,
    file.results.filter((r) => r.firstOutcome?.goalkeeperAction?.startsWith('parry')).length,
    file.results.reduce((sum, r) => sum + r.sameAttackFollowUps, 0),
    n(
      descriptive(
        file.results.flatMap((r) =>
          r.followUpReleases
            .filter((s) => s.sameAttackAfterSave && s.afterSaveSeconds !== null)
            .map((s) => s.afterSaveSeconds!),
        ),
      ).mean,
    ),
  ]),
);
report +=
  '\nTwelve conditions share three seeds, two distances and two shot techniques. The potential rebound attacker is onside at the first shot in every condition. A legal initial shot is requested through the canonical resolver; this is not evidence of initial AI shot selection. All outcomes and subsequent NPC decisions are endogenous. The observer closes same-attack eligibility on opposing control or a stoppage, so later shots after a new attack do not count as follow-ups. Counts and latency are descriptive: a repeated save changes subsequent possession geometry, so shorter waiting does not imply more shots. Full frozen states and contacts remain in the local PR162-rebounds.json.gz archive.\n\n';
report += `## Observer and performance limits\n\nBoth mirrored full matches have identical complete initial/final canonical hashes with the observer enabled and disabled (${parity.length}/2); six short alternating timing pairs also preserve complete state. Observer overhead median +2.40% and engine step-cost change median +3.09% have broad mean 95% intervals (−9.76% to +12.70% and −8.94% to +12.87%). This small headless sample establishes neither a precise slowdown nor renderer FPS.\n`;
writeFileSync('docs/performance/PR162-SENSITIVITY_TABLES.md', report);
writeFileSync(
  'docs/performance/PR162-sensitivity-summary.json',
  JSON.stringify(
    {
      source: observed.manifest,
      methodology: evidence.methodology,
      accounting: evidence.accounting,
      fullAbility: summarizeBenchmark(fullAbility),
      abilities: abilities.map(({ level, file }) => ({ level, summary: summarizeBenchmark(file) })),
      duties: [nativeDuties, normalisedDuties].map((file) => ({
        config: file.manifest.config,
        summary: summarizeBenchmark(file),
      })),
      rebounds: [reboundsBefore, reboundsAfter],
    },
    null,
    2,
  ) + '\n',
);
console.info(
  JSON.stringify({
    source: observed.manifest.commit,
    parityMatches: parity.length,
    fullAbilityMatches: full.completedFullMatches,
    windowMatches: files
      .filter((f) => f.manifest.config.minutes === 10)
      .reduce((sum, f) => sum + f.completedMatches, 0),
  }),
);
