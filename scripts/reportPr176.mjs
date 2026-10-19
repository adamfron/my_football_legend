import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import { z } from 'zod';
const read = (name) => JSON.parse(readFileSync(`docs/performance/PR176-${name}.json`, 'utf8'));
const manifest = read('source-manifest');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const observed = readFileSync('../pr176-observed.json', 'utf8'),
  plain = readFileSync('../pr176-plain.json', 'utf8');
if (observed !== plain)
  throw new Error('Instrumented/plain complete ranking or continuation mismatch');
for (const f of manifest.historical)
  if (sha(readFileSync(f.path)) !== f.sha256)
    throw new Error(`Historical evidence changed: ${f.path}`);
const artifactSchema = z.object({
  version: z.literal(1),
  method: z.string(),
  rows: z.array(z.unknown()),
});
const emit = (name, method, rows) =>
  writeFileSync(
    `docs/performance/PR176-${name}.json`,
    JSON.stringify(artifactSchema.parse({ version: 1, method, rows }), null, 2) + '\n',
  );
const inventoryText = readFileSync('docs/PR176_TIMING_AND_THRESHOLD_INVENTORY.md', 'utf8');
const thresholds = inventoryText
  .split('\n')
  .filter((line) => /^\| T\d+ \|/.test(line))
  .map((line) => {
    const [id, source, currentValue, classification, interruptibility, recommendation] = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    return {
      id,
      source,
      currentValue,
      classification,
      interruptibility,
      recommendation,
      confidence:
        'Source-confirmed current branch; proposed disposition is experimental engineering judgement. Exact locations in PR176-source-census.json.gz.',
    };
  });
if (thresholds.length !== 84) throw new Error('Expected 84 interpreted timer/threshold rows');
emit(
  'threshold-inventory',
  'Interpreted clock/threshold inventory from the human-reviewed document; exhaustive source comparison/numeric census is separate.',
  thresholds,
);
const states = read('frozen-scores').rows,
  flight = read('pass-flight').rows,
  gates = read('candidate-gates').rows,
  sweeps = read('sensitivity').rows;
const weights = new Map();
for (const s of states)
  for (const r of s.ranking)
    for (const t of r.terms) {
      const key = `${r.action.type}:${t.line}:${t.expression}`;
      if (!weights.has(key))
        weights.set(key, {
          action: r.action.type,
          path: 'src/core/matchSimulation/matchActions.ts',
          line: t.line,
          formula: t.expression,
          units: 'heuristic utility points',
          samples: [],
          interpretation:
            'Executed additive operand of the canonical ranker; nested probability and physical quantities are in the accompanying forecast.',
          overlap: /pressure|laneRisk|utilityAdjustment|adaptation|memory|separation/i.test(
            t.expression,
          )
            ? 'Correlated geometry/history; see mathematical audit risk graph. Not automatically an independent probability.'
            : 'Action-specific value/cost; inspect source context.',
          confidence: 'High for executed operand and scale; match-level causal effect unmeasured',
          proposedCorrection:
            'Package B common subsequent-state value, with Package A ablation as fallback; preserve law/physics gates.',
        });
      weights.get(key).samples.push(t.value);
    }
emit(
  'scoring-weight-inventory',
  'Executed original expressions with empirical scales in selected frozen states; full source-only formulas separately in scoring-expressions. No coefficient registry used by gameplay.',
  [...weights.values()].map((w) => ({
    ...w,
    samples: undefined,
    count: w.samples.length,
    min: Math.min(...w.samples),
    max: Math.max(...w.samples),
    mean: w.samples.reduce((a, b) => a + b, 0) / w.samples.length,
  })),
);
const graph = [
  ['opponent proximity', 'passer pressure', '1-nearest/14; geometric completion, execution sigma'],
  [
    'opponent proximity',
    'receiver pressure',
    'forecast nearest target /14; ranker evaluatePressure at current receiver differs',
  ],
  ['lane occupation', 'geometric completion', '-0.21 per qualifying intervenor'],
  ['lane occupation', 'pass utility', '-10L; build-up -7BL; through space laneRisk additionally'],
  ['defender arrival time', 'race risk', 'clamp((receiverETA-defenderETA+0.35)/1.1)'],
  ['receiver arrival time', 'timing risk', 'late=max(0,receiverETA-ballETA-0.12), clamp(late/0.7)'],
  ['defender arrival time', 'recovery risk', '0.35*clamp((ballETA-defenderETA+0.3)/2)'],
  ['receiver pressure', 'reception quality', '-0.2p plus speed capacity and execution adjustment'],
  ['receiver pressure', 'pass utility', '-17p; build-up -19Bp; remembered receiver term'],
  ['execution uncertainty', 'execution reach', '1-exp(-reachableRadius^2/(2sigma^2))'],
  ['execution uncertainty', 'pass utility', '-sigma*(1+receivingPressure)*(0.7+read)'],
  ['geometric completion', 'expected completion', 'multiply by execution reach'],
  ['reception quality', 'retention quality', 'clamp((q-0.25)/0.5)'],
  ['expected completion', 'retained possession', 'Pcompletion*Qretention*(1-recoveryRisk)'],
  ['retained possession', 'pass utility', '-(1-R)*(38+38read)*(1-0.3appetite)'],
  ['match urgency', 'appetite', 'trailing after 75min +0.15; transition +0.18'],
  ['match urgency', 'pass utility', 'different urgency: pressure*controlAge; +24uPcompletion'],
  ['field position', 'territorial value', '70depth+centrality*(5+15finalThird)+10finalThird'],
  ['forward progression', 'pass utility', 'delta fieldValue *1.05 or 1.5; not forward metres'],
  ['passing distance', 'ball flight time', 'desired ETA, v0 ceiling, same physical integrator'],
  ['passing distance', 'execution uncertainty', 'quadratic rangeDemand'],
  ['passing distance', 'pass utility', '-0.3length; preparation demand'],
  ['teammate ability', 'reception quality', 'firstTouch/technique/agility/composure/concentration'],
  ['teammate ability', 'receiver arrival time', 'pace/agility/fitness via canonical estimator'],
  ['tactical memory', 'pass utility', 'solution/adaptation/attack-failure terms'],
  ['tactical memory', 'movement support', 'relief support, compactness, lineDepth'],
  [
    'ball controllability',
    'candidate availability',
    'finite foot reach, first-time contact, carry exposure',
  ],
  ['preparation time', 'pass utility', 'min(65,55*negative action-specific margin)'],
  ['preparation time', 'live ranking gate', 'max(physical, perception,0.2) AND global cooldown'],
  ['ball flight time', 'receiver readiness', 'overlapping awareness/turn/movement'],
  ['ball flight speed', 'reception quality', 'excess speed above comfortable capacity'],
];
emit(
  'scoring-dependency-graph',
  'Directed factor/transform graph. Edges represent correlated information paths, not proven statistical independence.',
  graph.map(([from, to, transformation]) => ({ from, to, transformation })),
);
const issues = [
  [
    'R1',
    1,
    'matchActions.ts;passDecision.ts',
    'Confirmed overlapping geometric risk paths and incompatible action-value scales',
    'Unify terminal/continuation state value and one turnover consequence; compare risk-channel ablations',
    'High source; medium causal',
    'May increase central turnovers; pair 8s continuations with counterattack value',
  ],
  [
    'R2',
    2,
    'matchActions.ts;passReception.ts;spacePassing.ts',
    'Lead-before-through gates, speed/waypoint discontinuities and nearest-three space shortlist',
    'Generate prospective receiver-run corridors independently; keep physical/offside evaluation',
    'High source and selected-state; population frequency unknown',
    'Candidate/CPU explosion; cap three runners and bounded corridors',
  ],
  [
    'R3',
    3,
    'tacticalPositioning.ts;matchSimulation.ts;combinationPlay.ts',
    'Blended support, later overrides and independent short-lived combination values',
    'Explicit movement authority and two-action continuation value; preserve two available nonparticipant cover',
    'High source; medium connection to scarcity',
    'Uncovered transitions; one coordinated run budget',
  ],
  [
    'R4',
    4,
    'passLaunchPlan.ts;receiverReadiness.ts;passReception.ts',
    'Intent deadline raises arrival speed and can collapse reception forecast',
    'Evaluate feasible speed envelope then optimise tactical arrival among <=3 plans',
    'High quantitative; real-world speed realism not established',
    'Slow interception-prone passes or long-pass dominance',
  ],
  [
    'R5',
    5,
    'matchActions.ts;matchSimulation.ts;onBallPreparation.ts',
    'Global hold/carry clock gates routine reevaluation despite physical readiness',
    'Hybrid readiness, latched semantic interrupts and finite physical commitment',
    'High source; opportunity-loss estimate inconclusive (zero in 4 selected 3s windows)',
    'Machine-gun passing and CPU churn; minimum perception latency and contact ownership',
  ],
  [
    'R6',
    6,
    'matchActions.ts;shootingOpportunity.ts;shootingOptions.ts',
    'Shot value is terminal-only and highly nonlinear; carry has repeated skill/progression offsets',
    'Common state-value scale; preserve shot eligibility/error/GK; compare moderate-range risk tradeoffs',
    'High source; strong PR175 scarcity; attribution not isolated',
    'Low-quality shot spam and inflated conversion if also changing accuracy',
  ],
  [
    'R7',
    7,
    'matchActions.ts;passDecision.ts;passExecution.ts',
    'GameReading can reduce risky pass utility despite better execution estimate',
    'Attributes improve information/execution; explicit tactical risk appetite separate from skill',
    'High derivative and frozen sweep',
    'Removing all caution would misrepresent decision quality',
  ],
];
emit(
  'issue-solution-registry',
  'Ranked implementation hypotheses, each with source, proposal, confidence and decisive regression risk.',
  issues.map(([id, priority, modules, existing, proposed, confidence, risk]) => ({
    id,
    priority,
    modules: modules.split(';').map((m) => `src/core/matchSimulation/${m}`),
    existing,
    proposed,
    confidence,
    risk,
    reproduction:
      'Frozen scores / candidate gates / sensitivity / pass flight receipts; PR177 paired continuations and independent heldout',
    packages: ['B preferred', 'A fallback', 'C high risk'],
  })),
);
emit(
  'research-integrity',
  'No gameplay edits. Same all generated rankings and four 3-second canonical whole-state continuation hashes with and without opt-in operand tracing. Historical files independently hashed.',
  [
    {
      rankingAndContinuationParity: true,
      observedSha256: sha(observed),
      plainSha256: sha(plain),
      pairs: JSON.parse(observed),
      historicalFilesUnchanged: manifest.historical.length,
      sourceHash: manifest.normalizedProductionHash,
      states: states.length,
      candidatePairs: gates.length,
      sensitivityRows: sweeps.length,
      passFlightRows: flight.length,
      vanishedWhileBlocked: read('opportunity-windows').rows.flatMap((r) => r.vanishedWhileBlocked)
        .length,
    },
  ],
);

const n = (v) => (typeof v === 'number' ? v.toFixed(3) : '—');
let md =
  '# PR176 — Numerical appendix\n\nGenerated by `node scripts/reportPr176.mjs`. Source: merged PR175 `52748e2`; production hash `' +
  manifest.normalizedProductionHash +
  '`. All values are diagnostic heuristic points, not calibrated probabilities of football success.\n\n## Natural states and all action families\n\nSelected historical development states are dependent observations. Every rejected generated action and signed operand is retained in [frozen-scores](performance/PR176-frozen-scores.json). No unobserved state is described as natural.\n\n| State | Time s | Actor | Winner / score | Hold | Best carry | Best pass | Best shot |\n|---|---:|---|---|---:|---:|---:|---:|\n';
for (const s of states) {
  const best = (type) => s.ranking.find((r) => r.action.type === type)?.score;
  md += `| ${s.id} | ${n(s.at)} | ${s.actor.slot.position} | ${s.ranking[0].action.type} / ${n(s.ranking[0].score)} | ${n(best('hold'))} | ${n(best('carry'))} | ${n(best('pass'))} | ${n(best('shot'))} |\n`;
}
md +=
  '\n## Real centre-back choice at 39 seconds\n\n`pr175-natural:0`: full original component values below; columns group only independent additive operands from the actual scorer. Remainder includes every other operand, including positive technical/recycle/separation/style terms. The total also includes deterministic noise in [-4,4].\n\n| Receiver / intent | Retained forecast | Base | Retention/uncertainty | Progress | Length | Pressure | Lane | Preparation | Other | Noise | Total |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
for (const r of states[0].ranking.filter((r) => r.action.type === 'pass')) {
  const val = (prefix) =>
    r.terms.filter((t) => t.expression.startsWith(prefix)).reduce((a, t) => a + t.value, 0);
  const v = [
    val('28'),
    val('decision.utilityAdjustment'),
    val('progression *'),
    val('length *'),
    val('receiverPressure *'),
    val('laneRisk *'),
    val('preparationPenalty'),
  ];
  md += `| ${r.receiverRole} / ${r.action.intent}${r.action.delivery === 'lofted' ? ' lofted' : ''} | ${n(r.forecast.expectedRetainedPossession)} | ${v.map(n).join(' | ')} | ${n(r.canonicalScore - v.reduce((a, b) => a + b, 0))} | ${n(r.deterministicNoise)} | ${n(r.score)} |\n`;
}
md +=
  '\n## Launch deadlines and physical flight\n\nPrescribed stationary receiver, unchanged frozen opponents. These are physical/planning probes, not claims all intents would be generated. Readiness, execution sigma, interception/reception forecast and full vectors are in [pass-flight](performance/PR176-pass-flight.json). The aerial planner ignores ground deadlines. `ETA` is the forecast meeting envelope; exact ground centre crossing and independently integrated nearest point are also retained.\n\n| Distance m | Intent | Delivery | Ground deadline s | ETA s | Initial m/s | Arrival m/s | Reception q | Retained forecast |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const f of flight)
  md += `| ${f.metres} | ${f.intent} | ${f.delivery} | ${n(f.desiredGroundDeadline)} | ${n(f.plan.predictedArrivalTime)} | ${n(f.plan.speed)} | ${n(f.plan.predictedArrivalSpeed)} | ${n(f.forecast.expectedReceptionQuality)} | ${n(f.forecast.expectedRetainedPossession)} |\n`;
md +=
  '\n## Attribute and discontinuity probes\n\nIn the first real centre-back geometry, a prescribed progressive pass to the same CM is rescored at different passer game-reading values. The prescribed intent is explicit: it need not be the originally generated support/lead label. All other factors are held fixed.\n\n| Game reading | Retained forecast | Utility adjustment | Total canonical pass score |\n|---|---:|---:|---:|\n';
for (const s of sweeps.filter((s) => s.factor === 'passerGameReading'))
  md += `| ${s.value} | ${n(s.forecast.expectedRetainedPossession)} | ${n(s.forecast.utilityAdjustment)} | ${n(s.passScore)} |\n`;
md +=
  '\nAt receiver speed 0.349→0.350 m/s, lead projection distance changes from 2.59 to 3.86 m and `deriveLeadPass` changes true→false in this geometry. More speed does not guarantee more candidates. Full sweeps include orientation, pace, marker clearance, lane width, target distance, skill, burst, phase, score, minute 75 and cooldown. They do not estimate match-level prevalence.\n\n## Sampling limits\n\n190 teammate pairs: ' +
  gates.filter((g) => g.semanticIntent === 'support').length +
  ' lead requests reclassified to support, ' +
  gates.filter((g) => g.leadEligible).length +
  ' accepted lead projections; ' +
  gates.filter((g) => g.generatedLeadOrThrough.some((a) => a.intent === 'through')).length +
  ' pair generates ordinary through, ' +
  gates.filter((g) => g.spaceActions.length).length +
  ' pair has space pass. The denominator is all selected teammate pairs, not otherwise physically viable through opportunities. Four sampled 3s windows contain zero appeared-and-vanished valuable proxies while blocked. This does not quantify harmful timer loss or prove absence.\n';
md +=
  '\n## Actual releases and diagonal switches\n\n28 prescribed direct passes use the real canonical resolver (normal seeded execution), followed by physical-only integration without players. Nominal plan and actual launch are separately retained; target error, nominal height and speed ceiling may all affect the difference. No row represents an autonomous candidate-selection success.\n\n| Distance m | Geometry | Delivery | Planned speed | Released speed | Planned ETA | Closest arrival | Miss at planned ETA m | Closest miss m |\n|---|---|---|---:|---:|---:|---:|---:|---:|\n';
for (const r of read('released-flight').rows)
  md += `| ${r.metres} | ${r.geometry} | ${r.delivery} | ${n(r.plan.speed)} | ${n(r.actualReleaseSpeed)} | ${n(r.plan.predictedArrivalTime)} | ${n(r.actualNearestAt)} | ${n(r.missAtPlannedTimeMetres)} | ${n(r.actualNearestMissMetres)} |\n`;
writeFileSync('docs/PR176_NUMERICAL_APPENDIX.md', md);
writeFileSync(
  'docs/performance/PR176-research-logs.json.gz',
  gzipSync(
    JSON.stringify({
      instrumented: readFileSync('../pr176-audit.log', 'utf8'),
      plain: readFileSync('../pr176-plain.log', 'utf8'),
    }),
  ),
);
console.log(
  JSON.stringify({
    weights: weights.size,
    issues: issues.length,
    graphEdges: graph.length,
    parity: true,
    historicalUnchanged: manifest.historical.length,
  }),
);
