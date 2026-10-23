/* global structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import {
  runTacticalPatternTrial,
  createCognitionFixture,
  auditDecisionSnapshot,
} from '../src/core/matchSimulation/tacticalCognitionLab.ts';
import {
  runDirectedContactTrial,
  runKeeperEncounter,
  runDecisionTimingTrial,
} from '../src/core/matchSimulation/attributeCognitionLab.ts';
import {
  RESEARCH_COACHES,
  familiaritySchema,
  learnPattern,
  revisePattern,
  observeTacticalScene,
  makeTacticalAdvice,
  judgeContextualOptions,
} from '../src/core/matchSimulation/tacticalCognition.ts';
import { PR187_POLICY_SPECIFICATIONS } from '../src/core/matchSimulation/decisionResearchProtocol.ts';
import { runFootballSkillTrial } from '../src/core/matchSimulation/footballPerformanceLab.ts';
import { createFootballDrillCatalog } from '../src/core/matchSimulation/footballLabCatalog.ts';
import { runFeintTrial } from '../src/core/matchSimulation/extendedPhysicalLab.ts';
import { CONTACT_RESEARCH_PLAN } from '../src/core/matchSimulation/footballContactResearchPlan.ts';
import { createFootballLabProfile } from './footballLabProfile.ts';
import { inventoryFootballAttributes } from './footballLabAttributeCoverage.ts';
import { resolveCanonicalShot } from '../src/core/matchSimulation/shotResolver.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { withRankingObserver } from '../src/core/matchSimulation/decisionObservation.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const out = 'docs/performance',
  traceDir = `${out}/pr186-traces`;
mkdirSync(traceDir, { recursive: true });
const files = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort();
const sourceFiles = files.map((path) => ({
  path: `src/${path}`,
  sha256: sha(readFileSync(`src/${path}`, 'utf8').replaceAll('\r\n', '\n')),
}));
const sourceSha256 = sha(sourceFiles),
  harnessSha256 = sha(readFileSync('scripts/benchmarkPr186.mjs', 'utf8').replaceAll('\r\n', '\n'));
const baseCommit = 'e5b1a5cbbeb32f22be0278ad4a6800c3beea5496';
const historical = readdirSync(out, { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /^(PR18[45]-.*\.json|pr18[45]-.*\.(json|gz))$/.test(p))
  .sort()
  .map((p) => ({ path: `${out}/${p}`, sha256: sha(readFileSync(`${out}/${p}`)) }));
const baselinePath = `${out}/PR186-baseline.json`;
if (process.argv.includes('--replay')) {
  const saved = JSON.parse(readFileSync(baselinePath));
  for (const f of saved.historical)
    if (sha(readFileSync(f.path)) !== f.sha256)
      throw Error(`Historical evidence changed: ${f.path}`);
  const index = JSON.parse(readFileSync(`${out}/PR186-evidence-index.json`));
  if (index.sourceSha256 !== sourceSha256 || index.harnessSha256 !== harnessSha256)
    throw Error('Research source changed; regenerate explicitly');
  for (const item of index.groups)
    if (sha(readFileSync(item.archive)) !== item.archiveSha256)
      throw Error(`Archive changed: ${item.archive}`);
}
writeFileSync(
  baselinePath,
  JSON.stringify(
    {
      schemaVersion: 1,
      baseCommit,
      defaultPolicy: 'state-value-v1',
      cohort: 'development_only',
      historical,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `${out}/PR186-source-manifest.json`,
  JSON.stringify(
    { schemaVersion: 1, baseCommit, sourceSha256, harnessSha256, sourceFiles },
    null,
    2,
  ) + '\n',
);
const groups = [],
  started = performance.now(),
  cpu = process.cpuUsage();
const emit = (name, rows, summary) => {
  const archive = `${traceDir}/${name}.json.gz`,
    bytes = gzipSync(JSON.stringify(rows), { level: 9 });
  const item = { name, archive, archiveSha256: sha(bytes), trials: rows.length, summary };
  if (process.argv.includes('--replay')) {
    const old = JSON.parse(readFileSync(`${out}/PR186-${name}.json`));
    if (old.archiveSha256 !== item.archiveSha256) throw Error(`Non-deterministic group: ${name}`);
  }
  writeFileSync(archive, bytes);
  writeFileSync(
    `${out}/PR186-${name}.json`,
    JSON.stringify(
      { schemaVersion: 1, sourceSha256, harnessSha256, baseCommit, ...item },
      null,
      2,
    ) + '\n',
  );
  groups.push(item);
  console.log(`${name}: ${rows.length} trials`);
};
const stats = (values) => {
  const finite = values
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  return {
    samples: finite.length,
    censored: values.length - finite.length,
    mean: finite.length ? finite.reduce((a, b) => a + b, 0) / finite.length : null,
    min: finite[0] ?? null,
    median: finite[Math.floor(finite.length / 2)] ?? null,
    max: finite.at(-1) ?? null,
  };
};
const tally = (values) =>
  Object.fromEntries(
    [...new Set(values)].sort().map((v) => [v, values.filter((w) => v === w).length]),
  );
const patterns = ['counter_support', 'playmaker_run', 'press_triangle'],
  bands = [20, 40, 60, 80, 100];
let rows = [];
for (const pattern of patterns)
  for (const familiarity of [0.1, 0.5, 0.9])
    for (const [coachName, coach] of Object.entries(RESEARCH_COACHES))
      for (const mode of ['prepared', 'deliberate'])
        for (let rep = 0; rep < 4; rep++) {
          const result = runTacticalPatternTrial({
            pattern,
            seed: `pr186:pattern:${pattern}:${rep}`,
            familiarity,
            coach,
            mode,
          });
          rows.push({ coachName, result });
        }
for (const pattern of patterns)
  for (const control of ['novel', 'noCover'])
    rows.push({
      control,
      result: runTacticalPatternTrial({
        pattern,
        seed: `pr186:control:${pattern}`,
        familiarity: 0.9,
        [control]: true,
      }),
    });
for (const attribute of ['gameReading', 'concentration', 'physicalSkill', 'roleFamiliarity'])
  for (const band of bands)
    for (let rep = 0; rep < 4; rep++)
      rows.push({
        attribute,
        band,
        result: runTacticalPatternTrial({
          pattern: 'counter_support',
          seed: `pr186:recognition:${rep}`,
          familiarity: 0.7,
          [attribute]: attribute === 'roleFamiliarity' ? band / 100 : band,
        }),
      });
for (const mode of ['motor', 'prepared', 'deliberate'])
  for (const familiarity of [0.1, 0.9])
    rows.push({
      timingComparison: true,
      result: runTacticalPatternTrial({
        pattern: 'counter_support',
        seed: 'pr186:timing',
        familiarity,
        mode,
      }),
    });
const patternSummary = [];
for (const pattern of patterns)
  for (const familiarity of [0.1, 0.9])
    for (const mode of ['prepared', 'deliberate']) {
      const selected = rows.filter(
        (r) =>
          r.coachName === 'system' &&
          r.result.config.pattern === pattern &&
          r.result.config.familiarity === familiarity &&
          r.result.config.mode === mode,
      );
      patternSummary.push({
        pattern,
        familiarity,
        mode,
        recognitionSeconds: stats(
          selected.map((r) =>
            r.result.traces[0].recognitionAt === null
              ? null
              : r.result.traces[0].recognitionAt - 10,
          ),
        ),
        movementMetres: stats(selected.map((r) => r.result.participants[0].movedMetres)),
        arrivals: selected.filter((r) => r.result.participants[0].arrivalAt !== null).length,
        passOutcomes: tally(selected.map((r) => r.result.passOutcome)),
      });
    }
emit('tactical-patterns', rows, patternSummary);

rows = [];
for (const mode of ['motor', 'prepared', 'deliberate'])
  for (const familiarity of [0.1, 0.9])
    for (const preparationSeconds of [0.1, 1.2])
      for (const closingOpponent of [false, true])
        for (let rep = 0; rep < 4; rep++) {
          rows.push(
            runDecisionTimingTrial({
              seed: `pr186:timing:${rep}`,
              mode,
              familiarity,
              preparationSeconds,
              closingOpponent,
            }),
          );
        }
emit(
  'decision-timing',
  rows,
  ['motor', 'prepared', 'deliberate'].flatMap((mode) =>
    [0.1, 1.2].flatMap((preparationSeconds) =>
      [false, true].map((closingOpponent) => {
        const selected = rows.filter(
          (r) =>
            r.config.mode === mode &&
            r.config.preparationSeconds === preparationSeconds &&
            r.config.closingOpponent === closingOpponent,
        );
        return {
          mode,
          preparationSeconds,
          closingOpponent,
          trials: selected.length,
          released: selected.filter((r) => r.releasedAt !== null).length,
          intendedOutcomes: tally(selected.map((r) => r.intendedOutcome ?? 'no_intended_outcome')),
          episodeOutcomes: tally(selected.map((r) => r.episodeOutcome)),
          cancelled: tally(
            selected.filter((r) => r.cancellationReason).map((r) => r.cancellationReason),
          ),
        };
      }),
    ),
  ),
);

rows = [];
for (const [coachName, coach] of Object.entries(RESEARCH_COACHES))
  for (const adaptability of [20, 60, 100]) {
    const f = createCognitionFixture('counter_support', 'pr186:learning'),
      p = f.state.players.find((p) => p.id === f.runnerIds[0]);
    p.profile.hiddenProfile.adaptability = adaptability;
    let knowledge = familiaritySchema.parse({
      pattern: 'counter_support',
      signature: 'v1',
      roleId: 'advanced_forward',
      partnerId: f.sourceId,
      system: 0.1,
      role: 0.1,
      partner: 0.1,
    });
    const progression = [];
    for (let exposure = 0; exposure < 32; exposure++) {
      knowledge = learnPattern(knowledge, p, {
        kind: exposure % 3 ? 'cooperation' : 'training',
        meaningful: true,
        compatibility: 1 - coach.complexity * 0.2,
      });
      // An explicit compatible revision schedule uses the independent change-frequency dimension.
      if (coach.changeFrequency > 0.5 && exposure % 8 === 7)
        knowledge = revisePattern(knowledge, `revision-${exposure}`, 0.7);
      progression.push(structuredClone(knowledge));
    }
    rows.push({ coachName, coach, adaptability, progression });
  }
emit(
  'learning',
  rows,
  rows.map((r) => ({
    coach: r.coachName,
    adaptability: r.adaptability,
    final: r.progression.at(-1),
    interpretation: 'experimental relevant-exposure model; no career persistence',
  })),
);

rows = [];
for (let rep = 0; rep < 8; rep++) {
  const seed = `pr186:advice:${rep}`,
    f = createCognitionFixture('counter_support', seed),
    leader = f.state.players.find((p) => p.id === f.runnerIds[1]);
  leader.facingAngle = Math.PI / 2;
  leader.profile.attributes.gameReading = 90;
  leader.profile.attributes.leadership = 90;
  const observation = observeTacticalScene(f.state, leader, 'counter_support');
  const advice = makeTacticalAdvice(observation, leader, f.runnerIds[0], 'counter_support', {
    x: 70,
    y: 30,
  });
  if (!advice) throw Error('Advice fixture has no visible evidence');
  for (const condition of ['none', 'relevant', 'inaccurate', 'expired', 'low_authority']) {
    const message =
      condition === 'none'
        ? undefined
        : condition === 'inaccurate'
          ? { ...advice, target: { x: 64, y: 20 } }
          : condition === 'expired'
            ? { ...advice, observedAt: 8, sentAt: 8, expiresAt: 9 }
            : condition === 'low_authority'
              ? { ...advice, authority: 0, confidence: 0.2 }
              : advice;
    rows.push({
      condition,
      evidence: observation,
      message: message ?? null,
      result: runTacticalPatternTrial({
        pattern: 'counter_support',
        seed,
        familiarity: 0.1,
        gameReading: 20,
        advice: message,
      }),
    });
  }
}
emit(
  'communication',
  rows,
  [...new Set(rows.map((r) => r.condition))].map((condition) => {
    const selected = rows.filter((r) => r.condition === condition);
    return {
      condition,
      responses: tally(selected.map((r) => r.result.traces[0].advice)),
      movementMetres: stats(selected.map((r) => r.result.participants[0].movedMetres)),
      passOutcomes: tally(selected.map((r) => r.result.passOutcome)),
    };
  }),
);

rows = [];
for (const match of ['neutral', 'protecting', 'chasing'])
  for (const fatigue of [0.1, 0.9])
    for (const personalIncentive of [0, 1])
      for (const [coachName, coach] of Object.entries(RESEARCH_COACHES)) {
        const actor = createCognitionFixture('counter_support', 'pr186:judgment').state.players[0];
        const context = {
          match,
          fatigue,
          personalIncentive,
          coach,
          confidence: 0.8,
          pressure: fatigue > 0.5 ? 0.9 : 0.2,
        };
        const options = [
          {
            id: 'team_support',
            value: 0.1,
            personalAppeal: 0.1,
            risk: 0.25,
            compliant: true,
            feasible: true,
            observed: true,
          },
          {
            id: 'individual_attempt',
            value: 0.09,
            personalAppeal: 0.9,
            risk: 0.55,
            compliant: false,
            feasible: true,
            observed: true,
          },
          {
            id: 'unobserved_attempt',
            value: 0.3,
            personalAppeal: 1,
            risk: 0.1,
            compliant: true,
            feasible: true,
            observed: false,
          },
        ];
        rows.push({
          coachName,
          context,
          options,
          result: judgeContextualOptions(options, context, actor),
          interpretation:
            'injected interpretation/near-tie experiment, not canonical attribute validation',
        });
      }
emit('human-factors', rows, {
  selected: tally(rows.map((r) => r.result.selected)),
  maximumRegret: Math.max(...rows.map((r) => r.result.teamValueRegret ?? 0)),
  executionAndOutcomeNotInferred: true,
});

rows = [];
for (const band of bands)
  for (let rep = 0; rep < 16; rep++)
    for (const condition of [
      'slow',
      'fast',
      'oblique',
      'pressure',
      'unreachable',
      'negative_control',
    ]) {
      const result = runDirectedContactTrial({
        seed: `pr186:header:${rep}`,
        attribute: condition === 'negative_control' ? 'aggression' : 'heading',
        band,
        contact: 'header',
        speed: condition === 'fast' ? 14 : 8,
        height: condition === 'unreachable' ? 3 : 1.8,
        angle: condition === 'oblique' ? 0.65 : 0,
        pressure: condition === 'pressure',
      });
      rows.push({ family: 'heading', condition, band, result });
    }
for (const attribute of ['composure', 'setPieces'])
  for (const band of bands)
    for (let rep = 0; rep < 16; rep++)
      for (const pressure of [false, true])
        rows.push({
          family: attribute,
          condition: pressure ? 'pressure' : 'unpressured',
          band,
          result: runDirectedContactTrial({
            seed: `pr186:${attribute}:${rep}`,
            attribute,
            band,
            contact: attribute === 'setPieces' ? 'free_kick' : 'foot',
            pressure,
          }),
        });
const contactSummary = [];
for (const family of ['heading', 'composure', 'setPieces'])
  for (const condition of [
    ...new Set(rows.filter((r) => r.family === family).map((r) => r.condition)),
  ])
    for (const band of bands) {
      const selected = rows.filter(
        (r) => r.family === family && r.condition === condition && r.band === band,
      );
      contactSummary.push({
        family,
        condition,
        band,
        reached: selected.filter((r) => r.result.reached).length,
        executed: selected.filter((r) => r.result.executedAt !== null).length,
        targetError: stats(selected.map((r) => r.result.targetError)),
        onTarget: selected.filter((r) => r.result.onTarget).length,
      });
    }
emit('attribute-contacts', rows, contactSummary);

rows = [];
for (const band of bands)
  for (let rep = 0; rep < 8; rep++) {
    for (const releaseAfter of [0, 0.15, 0.6, 1.2])
      for (const intent of ['placed', 'chip'])
        rows.push({
          family: 'oneOnOnes',
          condition: `${releaseAfter}-${intent}`,
          band,
          result: runKeeperEncounter({
            seed: `pr186:keeper:${rep}`,
            exercise: 'closing',
            attribute: 'oneOnOnes',
            band,
            releaseAfter,
            intent,
            lateral: rep % 2 ? 1.5 : -1.5,
          }),
        });
    for (const passTargetX of [88, 92, 96])
      rows.push({
        family: 'goalkeeperSweeping',
        condition: `target-${passTargetX}`,
        band,
        result: runKeeperEncounter({
          seed: `pr186:sweep:${rep}`,
          exercise: 'sweep',
          attribute: 'goalkeeperSweeping',
          band,
          passTargetX,
        }),
      });
  }
emit(
  'attribute-keepers',
  rows,
  ['oneOnOnes', 'goalkeeperSweeping'].flatMap((family) =>
    bands.map((band) => {
      const selected = rows.filter((r) => r.family === family && r.band === band);
      return {
        family,
        band,
        episodeOutcomes: tally(selected.map((r) => r.result.outcome)),
        scheduledShotOutcomes: tally(
          selected.map((r) => r.result.scheduledShotOutcome ?? 'no_scheduled_shot_outcome'),
        ),
        meaningfulSweeps: selected.filter((r) => r.result.meaningfulSweep).length,
        actualShotReleases: selected.filter((r) => r.result.shotReleasedAt !== null).length,
        keeperMetres: stats(selected.map((r) => r.result.keeperMetres)),
      };
    }),
  ),
);

rows = [];
const catalog = createFootballDrillCatalog(),
  profile = createFootballLabProfile();
for (const attribute of ['technique', 'dribbling', 'firstTouch', 'agility'])
  for (const band of bands)
    for (let rep = 0; rep < 4; rep++)
      for (const drill of ['receive-18-spin-60', 'out-back-left']) {
        const card = structuredClone(profile);
        card.attributes[attribute] = band;
        const result = runFootballSkillTrial(
          catalog.find((c) => c.id === drill),
          card,
          `pr186:overlap:${drill}:${rep}`,
        );
        rows.push({
          attribute,
          band,
          drill,
          input: result.input,
          status: result.status,
          failure: result.failure,
          finishSeconds: result.finishSeconds,
          metrics: result.metrics,
        });
      }
emit(
  'attribute-overlaps',
  rows,
  ['technique', 'dribbling', 'firstTouch', 'agility'].flatMap((attribute) =>
    bands.map((band) => {
      const selected = rows.filter((r) => r.attribute === attribute && r.band === band);
      return {
        attribute,
        band,
        statuses: tally(selected.map((r) => r.status)),
        firstContact: stats(selected.map((r) => r.metrics.firstContactQuality)),
        recovery: stats(selected.map((r) => r.metrics.laterRecoverySeconds)),
        turnSeconds: stats(selected.map((r) => r.metrics.bodyTurnDurationSeconds)),
        controlledSpeed: stats(selected.map((r) => r.metrics.controlledMetresPerSecond)),
      };
    }),
  ),
);

rows = [];
for (const attribute of ['technique', 'dribbling'])
  for (const band of bands)
    for (let rep = 0; rep < 8; rep++)
      for (const defender of ['commit', 'delay']) {
        const card = structuredClone(profile);
        card.attributes[attribute] = band;
        const result = runFeintTrial({ defender, separation: 1.2 }, card, `pr186:duel:${rep}`);
        rows.push({ attribute, band, defender, result });
      }
emit(
  'attribute-duels',
  rows,
  ['technique', 'dribbling'].flatMap((attribute) =>
    bands.map((band) => {
      const selected = rows.filter((r) => r.attribute === attribute && r.band === band);
      return {
        attribute,
        band,
        escaped: selected.filter((r) => r.result.escaped).length,
        completedMove: selected.filter((r) => r.result.completedMove).length,
        contactCounts: stats(selected.map((r) => r.result.contacts.length)),
        failures: tally(selected.map((r) => r.result.failure ?? 'none')),
      };
    }),
  ),
);

rows = [];
for (const policy of ['state-value-v1', 'role-value-v1', 'role-intent-v1', 'phase-role-hybrid-v1'])
  for (const depth of [60, 78, 88])
    for (const readiness of ['ready', 'preparing', 'foot_unavailable']) {
      const f = createCognitionFixture('counter_support', `pr186:audit:${depth}`),
        s = f.state,
        actor = s.players.find((p) => p.id === f.sourceId);
      s.decisionPolicy = policy;
      actor.position = { x: depth, y: 34 };
      actor.velocity = { x: 0, y: 0 };
      s.ball = { ...playerContactGeometry(actor).rightFoot, ownerId: actor.id, height: 0.11 };
      if (readiness === 'preparing') s.onBallPreparation.readyAt = 11;
      else delete s.onBallPreparation;
      if (readiness === 'foot_unavailable') s.ball.x -= 1.5;
      const audit = auditDecisionSnapshot(s, actor.id);
      const executions = audit.candidates
        .filter((r) => r.action.type === 'shot' && r.value !== null)
        .map((r) => ({
          action: r.action,
          value: r.value,
          goalExpectation: r.goalExpectation,
          shot: resolveCanonicalShot(s, r.action),
        }));
      rows.push({ policy, depth, readiness, audit, executions });
    }
emit('decision-audit', rows, {
  snapshots: rows.length,
  shotMenuMissing: rows.reduce((n, r) => n + r.audit.shotMenuMissing, 0),
  atCap: rows.filter((r) => r.audit.atCap).length,
  collapsedTechniqueSnapshots: rows.filter(
    (r) =>
      r.executions.length > 1 && new Set(r.executions.map((v) => v.goalExpectation)).size === 1,
  ).length,
  interpretation:
    'Controlled geometry only; candidate absence/valuation/preparation/contact separated. Shared shot expectation is diagnosed for PR187, not retuned.',
});

const f = createCognitionFixture('counter_support', 'pr186:observer-neutrality');
let bare = structuredClone(f.state),
  observed = structuredClone(f.state),
  rankings = 0;
for (let i = 0; i < 240; i++) {
  bare = stepTacticalMatchAfterDecisionProbe(bare, 0.025);
  observed = withRankingObserver(
    (s, id) => {
      rankings++;
      if (rankings < 4) auditDecisionSnapshot(s, id);
    },
    () => stepTacticalMatchAfterDecisionProbe(observed, 0.025),
  );
}
if (sha(bare) !== sha(observed)) throw Error('Observer altered canonical state');
emit(
  'observer-neutrality',
  [
    {
      seed: f.state.seed,
      ticks: 240,
      rankings,
      inputSha256: sha(f.state),
      bareSha256: sha(bare),
      observedSha256: sha(observed),
    },
  ],
  { identical: true },
);
const coverage = inventoryFootballAttributes({});
writeFileSync(
  `${out}/PR186-contact-plan.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      productionActivation: false,
      lawSource: 'https://www.theifab.com/laws/latest/fouls-and-misconduct/',
      consultedOn: '2026-10-24',
      cases: CONTACT_RESEARCH_PLAN,
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  `${out}/PR186-attribute-source-inventory.json`,
  JSON.stringify(coverage, null, 2) + '\n',
);
writeFileSync(
  `${out}/PR186-policy-specifications.json`,
  JSON.stringify(
    { schemaVersion: 1, policies: PR187_POLICY_SPECIFICATIONS, productionActivation: false },
    null,
    2,
  ) + '\n',
);
const index = {
  schemaVersion: 1,
  baseCommit,
  sourceSha256,
  harnessSha256,
  stepSeconds: 0.025,
  groups,
  totalTrials: groups.reduce((n, g) => n + g.trials, 0),
  seeds: 'pr186:<family>:<context>:<rep>; shared across compared bands',
  interpretation:
    'Development and engineering evidence only. Prototype equations do not validate their source attributes. Untouched SS/SW/WW validation is reserved for PR187.',
};
writeFileSync(`${out}/PR186-evidence-index.json`, JSON.stringify(index, null, 2) + '\n');
writeFileSync(
  `${out}/PR186-performance.json`,
  JSON.stringify(
    {
      schemaVersion: 1,
      sourceSha256,
      harnessSha256,
      totalTrials: index.totalTrials,
      wallMilliseconds: performance.now() - started,
      cpuMicroseconds: process.cpuUsage(cpu),
      rssBytes: process.memoryUsage().rss,
      liveTickOverhead:
        'zero imports from live scheduler; explicit observer cost belongs to research runs',
    },
    null,
    2,
  ) + '\n',
);
console.log(JSON.stringify({ trials: index.totalTrials, wallMs: performance.now() - started }));
