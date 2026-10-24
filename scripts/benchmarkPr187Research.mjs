/* global structuredClone */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import {
  createCognitionFixture,
  auditDecisionSnapshot,
} from '../src/core/matchSimulation/tacticalCognitionLab.ts';
import {
  boundedExperimentSchema,
  boundedRuntimeSchema,
  boundedPolicySchema,
} from '../src/core/matchSimulation/boundedIntelligenceState.ts';
import { observeBoundedScene } from '../src/core/matchSimulation/boundedPerception.ts';
import {
  constructBoundedCandidates,
  runBoundedPolicy,
} from '../src/core/matchSimulation/boundedDecision.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';
import { stepTacticalMatchAfterDecisionProbe } from '../src/core/matchSimulation/matchSimulation.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';

const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const sourceManifest = readdirSync('src', { recursive: true })
  .map((p) => p.replaceAll('\\', '/'))
  .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
  .sort()
  .map((p) => ({
    path: `src/${p}`,
    sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
  }));
const sourceSha256 = sha(sourceManifest),
  evaluatorSha256 = sha(
    readFileSync('scripts/benchmarkPr187Research.mjs', 'utf8').replaceAll('\r\n', '\n'),
  );
const replay = process.argv.includes('--replay'),
  started = performance.now(),
  cpu = process.cpuUsage();
const baseline = JSON.parse(readFileSync('docs/performance/PR187-baseline.json'));
for (const f of baseline.historical)
  if (
    sha(
      f.path.endsWith('.json')
        ? readFileSync(f.path, 'utf8').replaceAll('\r\n', '\n')
        : readFileSync(f.path),
    ) !== f.sha256
  )
    throw Error(`Historical evidence modified: ${f.path}`);

// Controlled decision apparatus: identical typed observations/features, explicitly
// injected values. These establish mechanism contrasts, not football superiority.
const f = createCognitionFixture('press_triangle', 'pr187-controlled-contrast-01');
f.state.boundedExperiment = boundedExperimentSchema.parse({
  knowledge: { system: 0.9, role: 0.9, partner: 0.9 },
  coach: { creativeFreedom: 1 },
});
const actor = f.state.players.find((p) => p.id === f.sourceId),
  scene = observeBoundedScene(f.state, actor),
  receiver = scene.visible.find((p) => p.team === scene.team);
scene.intent = {
  actorId: actor.id,
  candidateKey: 'combination',
  goal: 'progress',
  startedAt: 9,
  expiresAt: 11,
  dependencies: [receiver.id],
  signature: scene.signature,
};
const base = {
  provenance: 'bounded-geometry-v1',
  evidenceIds: [receiver.id],
  observedAt: 10,
  closesAt: 12,
  readyAt: 9,
  benefit: 0.08,
  risk: 0.2,
  confidence: 0.9,
  progress: 10,
  goal: 'progress',
  compliant: true,
  feasible: true,
  forecast: null,
};
const candidates = [
  {
    ...base,
    id: 'window',
    action: { type: 'carry', actorId: actor.id, target: { x: 70, y: 34 } },
    closesAt: 10.4,
    benefit: 0.07,
    risk: 0.4,
  },
  {
    ...base,
    id: 'combination',
    action: {
      type: 'pass',
      actorId: actor.id,
      receiverId: receiver.id,
      target: receiver.position,
      intent: 'progressive',
      delivery: 'ground',
    },
    benefit: 0.075,
    risk: 0.4,
  },
  {
    ...base,
    id: 'possession',
    action: { type: 'carry', actorId: actor.id, target: { x: 64, y: 40 } },
    benefit: 0.077,
    risk: 0.3,
    goal: 'retain',
  },
  {
    ...base,
    id: 'hold',
    action: { type: 'hold', actorId: actor.id },
    benefit: 0.05,
    risk: 0.1,
    goal: 'retain',
  },
];
const contrasts = [];
for (const condition of [
  'prepared_combination',
  'failed_run',
  'expired_window',
  'planning_off',
  'individuality_off',
  'chasing',
  'protecting',
]) {
  const input = structuredClone({ scene, candidates });
  if (condition === 'failed_run') input.scene.intent.dependencies = ['absent'];
  if (condition === 'expired_window') input.candidates[0].closesAt = 9;
  if (condition === 'planning_off') input.scene.config.planning = false;
  if (condition === 'individuality_off') input.scene.config.individuality = false;
  if (['chasing', 'protecting'].includes(condition)) {
    input.scene.at = 4800;
    input.scene.scoreDifference = condition === 'chasing' ? -1 : 1;
    for (const c of input.candidates) {
      c.observedAt = 4800;
      c.readyAt = 4799;
      c.closesAt = 4802;
    }
    input.scene.intent = null;
  }
  contrasts.push({
    condition,
    input,
    decisions: boundedPolicySchema.options.map((p) => runBoundedPolicy(p, input)),
  });
}
if (
  contrasts[0].decisions.map((d) => d.selectedCandidateId).join(',') !==
  'window,combination,possession'
)
  throw Error('Architectural contrast failed');

const patternTrials = [];
for (const pattern of ['counter_support', 'playmaker_run', 'press_triangle'])
  for (const familiarity of [0.1, 0.9])
    for (const blocked of [false, true]) {
      const seed = `pr187-live-pattern-${pattern}-${blocked}`;
      const f = createCognitionFixture(pattern, seed);
      let s = f.state;
      s.decisionPolicy = 'hierarchical-intent-v1';
      s.playerAgencyEnabled = true;
      s.controlledFootballerId = f.sourceId;
      s.boundedExperiment = boundedExperimentSchema.parse({
        knowledge: { system: familiarity, role: familiarity, partner: familiarity },
      });
      s.boundedRuntime = boundedRuntimeSchema.parse({
        sightings: Object.fromEntries(
          f.runnerIds.map((id) => [id, { ownerId: f.opponentId, team: 'away', regainedAt: null }]),
        ),
      });
      if (pattern === 'playmaker_run')
        for (const [i, id] of f.coverIds.entries()) {
          const p = s.players.find((p) => p.id === id);
          p.position = { x: 30, y: 32 + i * 4 };
          p.anchor = { ...p.position };
          p.target = { ...p.position };
        }
      const initial = structuredClone(s),
        traces = [],
        movement = Object.fromEntries(f.runnerIds.map((id) => [id, 0]));
      let passAttemptedAt = null,
        passReleasedAt = null,
        passId = null,
        passAvailableAt = null;
      withBoundedObserver(
        (t) => traces.push(t),
        () => {
          for (let tick = 0; tick < 240; tick++) {
            const p = s.players.find((p) => p.id === f.sourceId),
              runner = s.players.find((p) => p.id === f.runnerIds[0]);
            const intent = s.boundedRuntime?.patterns[runner.id];
            if (blocked && tick === 24)
              s.playerMovementIntent = {
                actorId: f.opponentId,
                type: 'attack_space',
                target: { ...(intent?.target ?? runner.position) },
                startedAt: s.time,
                expiresAt: s.time + 2,
              };
            if (
              s.ball.ownerId === p.id &&
              passAvailableAt === null &&
              constructBoundedCandidates(observeBoundedScene(s, p)).some(
                (c) =>
                  c.action.type === 'pass' &&
                  c.action.receiverId === runner.id &&
                  c.feasible &&
                  c.readyAt <= s.time,
              )
            )
              passAvailableAt = s.time;
            if (tick === 68 && intent) {
              passAttemptedAt = s.time;
              const next = resolveMatchAction(
                s,
                {
                  type: 'pass',
                  actorId: p.id,
                  receiverId: runner.id,
                  target: intent.target,
                  requestedSpace: intent.target,
                  intent: pattern === 'press_triangle' ? 'support' : 'through',
                  delivery: 'ground',
                },
                'human_selected',
              );
              if (next.lastPassDiagnostic?.passId !== s.lastPassDiagnostic?.passId) {
                passReleasedAt = s.time;
                passId = next.lastPassDiagnostic.passId;
              }
              s = next;
            }
            const before = s;
            s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
            for (const id of f.runnerIds)
              movement[id] += distance(
                before.players.find((p) => p.id === id).position,
                s.players.find((p) => p.id === id).position,
              );
          }
        },
      );
      const actual = passId
        ? [s.lastResolvedPass, s.lastPassDiagnostic].find((p) => p?.passId === passId)
        : null;
      patternTrials.push({
        pattern,
        familiarity,
        blocked,
        seed,
        initial,
        traces,
        movement,
        participants: f.runnerIds.map((id) => ({
          id,
          intent: s.boundedRuntime?.patterns[id] ?? null,
          final: s.players.find((p) => p.id === id).position,
        })),
        passAvailableAt,
        passAttemptedAt,
        passReleasedAt,
        passId,
        passOutcome: actual?.finalResult ?? null,
        receiverArrival: s.boundedRuntime?.patterns[f.runnerIds[0]]?.arrivedAt ?? null,
        interpretation:
          'Designated tactical target arrival and pass completion are separate. A scripted opponent movement command starts after 0.6s and uses canonical locomotion; no body is relocated after initial placement.',
      });
    }

const shotTrials = [];
for (const x of [93, 86, 76])
  for (const keeperX of [102, 94])
    for (const skill of [40, 80])
      for (let rep = 0; rep < 4; rep++)
        for (const intent of ['driven', 'placed', 'chip']) {
          const seed = `pr187-shot-development-${x}-${keeperX}-${rep}`,
            f = createCognitionFixture('counter_support', seed);
          let s = f.state;
          s.decisionPolicy = 'opportunity-driven-v1';
          s.boundedExperiment = boundedExperimentSchema.parse({});
          const p = s.players.find((p) => p.id === f.sourceId),
            keeper = s.players.find((p) => p.team === 'away' && p.slot.position === 'goalkeeper');
          for (const q of s.players) {
            q.position = { x: q.team === 'home' ? 8 : 15, y: 5 };
            q.target = { ...q.position };
            q.anchor = { ...q.position };
            q.velocity = { x: 0, y: 0 };
          }
          p.profile = structuredClone(p.profile);
          p.profile.attributes.finishing = skill;
          p.profile.attributes.technique = skill;
          p.position = { x, y: 32 };
          p.target = { ...p.position };
          p.anchor = { ...p.position };
          p.facingAngle = Math.PI / 2;
          keeper.position = { x: keeperX, y: 34 };
          keeper.target = { ...keeper.position };
          keeper.anchor = { ...keeper.position };
          keeper.facingAngle = -Math.PI / 2;
          s.ball = {
            ...playerContactGeometry(p).rightFoot,
            ownerId: p.id,
            height: 0.11,
            lastTouchPlayerId: p.id,
          };
          delete s.onBallPreparation;
          const initial = structuredClone(s),
            prediction = constructBoundedCandidates(observeBoundedScene(s, p)).find(
              (c) => c.action.type === 'shot' && c.action.intent === intent,
            );
          const request = {
            type: 'shot',
            actorId: p.id,
            intent,
            target: { x: 105, y: 34 + (p.position.y <= 34 ? 2 : -2) },
            contact: 'settled',
          };
          s = resolveMatchAction(s, request, 'dev_ai_selected');
          const released =
              s.ball.shot?.shooterId === p.id && s.ball.shot.releasedAt === initial.time,
            shot = released ? structuredClone(s.ball.shot) : null;
          for (let tick = 0; tick < 240 && released; tick++) {
            s = stepTacticalMatchAfterDecisionProbe(s, 0.025);
            if (s.lastShot?.shotId === shot.shotId && s.lastShot.outcome) break;
            if (s.restart || s.postGoal) break;
          }
          const outcome =
            released && s.lastShot?.shotId === shot.shotId ? (s.lastShot.outcome ?? null) : null;
          shotTrials.push({
            seed,
            x,
            keeperX,
            skill,
            intent,
            initial,
            prediction: prediction?.forecast ?? null,
            requestedAction: request,
            released,
            shot,
            outcome,
            finalBall: s.ball,
            interpretation:
              'Canonical release and continuation with historical full-state GK controller. This is development forecast calibration, not a bounded goalkeeper validation.',
          });
        }
const shootingSummary = ['driven', 'placed', 'chip'].map((intent) => {
  const rows = shotTrials.filter((r) => r.intent === intent),
    resolved = rows.filter((r) => r.released && r.outcome !== null && r.prediction);
  return {
    intent,
    trials: rows.length,
    releases: rows.filter((r) => r.released).length,
    resolved: resolved.length,
    nullOutcomes: rows.filter((r) => r.outcome === null).length,
    predictedMean:
      resolved.reduce((a, r) => a + r.prediction.scoring, 0) / Math.max(1, resolved.length),
    goals: resolved.filter((r) => r.outcome === 'goal').length,
    brierMean:
      resolved.reduce(
        (a, r) => a + (r.prediction.scoring - (r.outcome === 'goal' ? 1 : 0)) ** 2,
        0,
      ) / Math.max(1, resolved.length),
    outcomes: Object.fromEntries(
      [...new Set(rows.map((r) => r.outcome ?? 'null'))].map((k) => [
        k,
        rows.filter((r) => (r.outcome ?? 'null') === k).length,
      ]),
    ),
  };
});

const historicalReceipt = JSON.parse(
  readFileSync('docs/performance/PR186-match-pr185-sw-phase-role-hybrid-v1-full-observed-0.json'),
);
const old = JSON.parse(gunzipSync(readFileSync(historicalReceipt.archive)));
const missedWindows = old.opportunityWindows
  .filter((w) => !w.shotReleased)
  .map((w) => {
    const s = w.stateAtOpen,
      a = s.players.find((p) => p.id === w.actorId),
      audit = auditDecisionSnapshot(s, a.id);
    return {
      at: w.openedAt,
      endsAt: w.endedAt,
      initialStateSha256: sha(s),
      audit,
      bounded: Object.fromEntries(
        boundedPolicySchema.options.map((policy) => {
          const scene = observeBoundedScene({ ...s, decisionPolicy: policy }, a),
            candidates = constructBoundedCandidates(scene);
          return [
            policy,
            { scene, candidates, decision: runBoundedPolicy(policy, { scene, candidates }) },
          ];
        }),
      ),
      interpretation:
        'Development diagnostic only. No earlier unobserved cue, preparation time reduction, foot reach bypass or forced release was invented. Earlier recognition/legitimate preparation counterfactuals remain unvalidated.',
    };
  });

const payload = {
  schemaVersion: 1,
  cohort: 'development_only',
  sourceSha256,
  evaluatorSha256,
  contrasts,
  patternTrials,
  shotTrials,
  shootingSummary,
  missedWindows,
};
const archive = 'docs/performance/pr187-traces/research-final.json.gz',
  receiptPath = 'docs/performance/PR187-research-final.json';
mkdirSync('docs/performance/pr187-traces', { recursive: true });
if (replay) {
  const saved = JSON.parse(readFileSync(receiptPath));
  if (
    sha(JSON.stringify(payload)) !== saved.payloadSha256 ||
    sha(readFileSync(archive)) !== saved.archiveSha256
  )
    throw Error('Research replay mismatch');
} else {
  const bytes = gzipSync(JSON.stringify(payload), { level: 9 });
  writeFileSync(archive, bytes);
  writeFileSync(
    receiptPath,
    JSON.stringify(
      {
        schemaVersion: 1,
        cohort: 'development_only',
        sourceSha256,
        evaluatorSha256,
        payloadSha256: sha(JSON.stringify(payload)),
        archive,
        archiveSha256: sha(bytes),
        contrasts: contrasts.map((r) => ({ condition: r.condition, decisions: r.decisions })),
        patternTrials: patternTrials.map(({ initial: _i, traces: _t, ...r }) => {
          void _i;
          void _t;
          return r;
        }),
        shootingSummary,
        missedWindows: missedWindows.map((r) => ({
          at: r.at,
          endsAt: r.endsAt,
          initialStateSha256: r.initialStateSha256,
          interpretation: r.interpretation,
        })),
        wallMilliseconds: performance.now() - started,
        cpuMicroseconds: process.cpuUsage(cpu),
        rssBytes: process.memoryUsage().rss,
        confirmation: 'NOT RUN: whole-match information boundary remains incomplete.',
      },
      null,
      2,
    ) + '\n',
  );
}
console.log({
  replay,
  contrasts: contrasts.length,
  patternTrials: patternTrials.length,
  shotTrials: shotTrials.length,
  shootingSummary,
  missedWindows: missedWindows.length,
  wallMs: performance.now() - started,
});
