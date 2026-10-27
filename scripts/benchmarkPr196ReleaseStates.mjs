import process from 'node:process';
import console from 'node:console';
import { captureCalibrationSnapshot } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  resolveMatchAction,
  rankAvailableActionsForAI,
} from '../src/core/matchSimulation/matchActions.ts';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { files, read, receipt, hash, retainSource } from './pr196Evidence.mjs';
const sourceArchive = retainSource(),
  rows = [];
const key = (a) =>
  JSON.stringify([
    a.type,
    a.receiverId ?? null,
    a.intent ?? null,
    a.delivery ?? null,
    a.target ?? null,
  ]);
for (const path of files('docs/performance/pr196/harvest')
  .filter((p) => /-baseline-v1\.json\.gz$/.test(p) && !p.includes('-capture-'))
  .sort()) {
  const run = read(path),
    start = run.captures.find((c) => c.reasons.some((r) => r.startsWith('uniform')));
  if (!start) continue;
  let s = read(start.path).state,
    found = 0;
  for (let tick = 0; tick < 800 && found < 2; tick++) {
    const before = s;
    s = step(s, 0.025);
    const pass = s.lastPassDiagnostic;
    if (
      !pass ||
      pass.passId === before.lastPassDiagnostic?.passId ||
      s.currentAction?.type !== 'pass'
    )
      continue;
    const actual = s.currentAction;
    const requested = resolveMatchAction(
      globalThis.structuredClone(before),
      actual,
      'autonomous_npc',
    );
    if (requested.lastPassDiagnostic?.passId === before.lastPassDiagnostic?.passId) continue;
    const snapshot = captureCalibrationSnapshot(before, actual.actorId),
      capturePath = `docs/performance/pr196/release-states/${run.design}-${run.policy}-${found}-v1.json.gz`;
    receipt(capturePath, snapshot);
    found++;
    const direction = snapshot.scene.direction,
      actor = before.players.find((p) => p.id === actual.actorId),
      pool = [
        ...snapshot.candidates.map((c) => c.action),
        ...snapshot.policyRankings
          .find((r) => r.policy === 'state-value-v1')
          .actions.map((r) => r.action),
      ];
    const correctedChoice = ['state-value-v1', 'phase-role-hybrid-v1'].includes(run.policy)
      ? rankAvailableActionsForAI(
          { ...before, experimentalCanonicalArrival: true },
          actual.actorId,
        )[0]?.action
      : actual;
    const alternatives = [
      ['actual_selected', actual],
      ['corrected_selected', correctedChoice],
      [
        'safe',
        pool.find((a) => a.type === 'pass' && a.intent === 'support' && key(a) !== key(actual)),
      ],
      [
        'progressive_declined',
        pool.find(
          (a) =>
            a.type === 'pass' &&
            direction * (a.target.x - actor.position.x) >= 8 &&
            key(a) !== key(actual),
        ),
      ],
      [
        'spatial',
        pool.find(
          (a) =>
            a.type === 'pass' &&
            (a.requestedSpace || a.intent === 'through') &&
            key(a) !== key(actual),
        ),
      ],
      ['carry', pool.find((a) => a.type === 'carry')],
      ['shot', pool.find((a) => a.type === 'shot' || a.type === 'header')],
      ['hold', { type: 'hold', actorId: actual.actorId }],
    ];
    const trials = [],
      cache = new Map();
    for (const [label, action] of alternatives.filter((x) => x[1])) {
      const initial =
          label === 'corrected_selected'
            ? { ...before, experimentalCanonicalArrival: true }
            : before,
        executionKey = `${label === 'corrected_selected'}:${key(action)}`,
        reused = cache.has(executionKey),
        result = cache.get(executionKey) ?? runCanonicalOutcomeTrial(initial, action, 8);
      cache.set(executionKey, result);
      trials.push({
        label,
        action,
        executionKey,
        reused,
        inputHash: hash(initial),
        finalHash: hash(result.final),
        samplesHash: hash(result.samples),
        outcome: result.outcome,
        boundedCandidate: snapshot.candidates.find((c) => key(c.action) === key(action)) ?? null,
        samples: result.samples.filter(
          (s, i) =>
            i % 10 === 0 || s.contacts.length || s.restart || i === result.samples.length - 1,
        ),
        bodies: result.bodies,
      });
    }
    rows.push({
      design: run.design,
      policy: run.policy,
      capturePath,
      initialHash: hash(before),
      selectionReason:
        'First two autonomous pass releases in the next 20 seconds that can also release through the executor from the saved pre-tick state; no continuation outcome filter',
      information: ['state-value-v1', 'phase-role-hybrid-v1'].includes(run.policy)
        ? 'legacy_full_world'
        : 'bounded_scene',
      actualSelected: actual,
      actualReleaseId: pass.passId,
      diagnosticRequestId: requested.lastPassDiagnostic.passId,
      correctedChoice,
      decisionChanged: correctedChoice ? key(actual) !== key(correctedChoice) : true,
      unavailable: alternatives.filter((x) => !x[1]).map((x) => x[0]),
      trials,
    });
    console.log(
      'autonomous release states',
      rows.length,
      run.design,
      run.policy,
      'alternatives',
      trials.length,
    );
  }
}
receipt(
  'docs/performance/pr196/release-counterfactuals-v1.json.gz',
  {
    schema: 'pr196-release-state-counterfactuals-v1',
    sourceArchive,
    classification:
      'Complementary availability stratum; biased toward actions that actually released, not a representative outcome-rate sample',
    limits: [
      'pre-tick state and diagnostic immediate request are explicitly distinguished from the original within-tick release',
      'full-world alternative menus do not become bounded player knowledge',
      'same-seed branches are dependent development evidence',
    ],
    rows,
  },
  process.argv.includes('--check'),
);
console.log('Autonomous release-state counterfactuals PASS', rows.length);
