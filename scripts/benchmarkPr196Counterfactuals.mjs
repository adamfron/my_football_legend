import process from 'node:process';
import console from 'node:console';
import { rankAvailableActionsForAI } from '../src/core/matchSimulation/matchActions.ts';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash, files, read, receipt, retainSource } from './pr196Evidence.mjs';
const rows = [],
  sourceArchive = retainSource();
const key = (a) =>
  JSON.stringify([
    a.type,
    a.receiverId ?? null,
    a.intent ?? null,
    a.delivery ?? null,
    a.target ? [a.target.x, a.target.y] : null,
  ]);
for (const path of files('docs/performance/pr196/harvest')
  .filter((p) => /-baseline-v1\.json\.gz$/.test(p) && !p.includes('-capture-'))
  .sort()) {
  const run = read(path);
  // The first systematic sample, first pressure sample and last systematic sample are chosen
  // without looking at alternative outcomes. Max three states per match, same selector on all policies.
  const chosen = [
    run.captures.find((c) => c.reasons.some((r) => r.startsWith('uniform'))),
    run.captures.find((c) => c.reasons.includes('pressure')),
    run.captures.at(-1),
  ].filter((c, i, xs) => c && xs.findIndex((x) => x?.path === c.path) === i);
  for (const c of chosen) {
    const snapshot = read(c.path),
      s = snapshot.state,
      actor = s.players.find((p) => p.id === c.actorId);
    const after = globalThis.structuredClone(snapshot);
    if (['state-value-v1', 'phase-role-hybrid-v1'].includes(run.policy)) {
      after.policyRankings.find((r) => r.policy === run.policy).actions = rankAvailableActionsForAI(
        { ...s, experimentalCanonicalArrival: true },
        actor.id,
      ).map((r) => ({ action: r.action, score: r.score }));
    }
    const selected = (snap) =>
      ['state-value-v1', 'phase-role-hybrid-v1'].includes(run.policy)
        ? snap.policyRankings.find((r) => r.policy === run.policy)?.actions[0]?.action
        : snap.candidates.find(
            (x) =>
              x.id ===
              snap.boundedDecisions.find((d) => d.policy === run.policy)?.selectedCandidateId,
          )?.action;
    const original = selected(snapshot),
      corrected = selected(after),
      all = [
        ...snapshot.candidates.map((x) => x.action),
        ...snapshot.policyRankings
          .find((r) => r.policy === 'state-value-v1')
          .actions.map((x) => x.action),
      ];
    const direction = snapshot.scene.direction;
    const options = [
      ['selected', original],
      ['corrected_selected', corrected],
      ['safe', all.find((a) => a.type === 'pass' && a.intent === 'support')],
      [
        'progressive_declined',
        all.find(
          (a) =>
            a.type === 'pass' &&
            direction * (a.target.x - actor.position.x) >= 8 &&
            (!original || key(a) !== key(original)),
        ),
      ],
      [
        'spatial',
        all.find((a) => a.type === 'pass' && (a.requestedSpace || a.intent === 'through')),
      ],
      ['carry', all.find((a) => a.type === 'carry')],
      ['shot', all.find((a) => a.type === 'shot' || a.type === 'header')],
      ['hold', { type: 'hold', actorId: actor.id }],
    ];
    const trials = [],
      cache = new Map();
    for (const [label, action] of options.filter((x) => x[1])) {
      const initial =
        label === 'corrected_selected' ? { ...s, experimentalCanonicalArrival: true } : s;
      const executionKey = `${label === 'corrected_selected' ? 'corrected' : 'baseline'}:${key(action)}`;
      const reused = cache.has(executionKey);
      const result = cache.get(executionKey) ?? runCanonicalOutcomeTrial(initial, action, 8);
      cache.set(executionKey, result);
      const twin =
        label === 'selected'
          ? runCanonicalOutcomeTrial(JSON.parse(JSON.stringify(initial)), action, 8, (o) => {
              o.ball.x = -999;
              o.contacts.length = 0;
            })
          : null;
      if (
        twin &&
        (hash(twin.final) !== hash(result.final) || hash(twin.samples) !== hash(result.samples))
      )
        throw Error('Observer/save replay drift');
      const sample = result.samples.at(-1);
      trials.push({
        label,
        action,
        executionKey,
        reused,
        inputHash: hash(initial),
        finalHash: hash(result.final),
        samplesHash: hash(result.samples),
        observerReplayNeutral: twin ? true : null,
        originalOutcome: result.outcome,
        candidateMembership: {
          boundedExact: snapshot.candidates.some((x) => key(x.action) === key(action)),
          boundedFamily: snapshot.candidates.some((x) => x.action.type === action.type),
          boundedAdmitted:
            snapshot.candidates.find((x) => key(x.action) === key(action))?.feasible ?? null,
          fullWorldB: snapshot.policyRankings
            .find((r) => r.policy === 'state-value-v1')
            .actions.some((x) => key(x.action) === key(action)),
        },
        horizonConsequences: {
          territory: direction * (sample.ball.x - s.ball.x),
          subsequentShot: result.samples.some(
            (x) =>
              x.shotId &&
              x.shotId !== result.contract.shotId &&
              x.shotId !== result.contract.previousShotId,
          ),
          restart: result.samples.find((x) => x.restart)?.restart ?? null,
          restartTeam: result.samples.find((x) => x.restart)?.restartTeam ?? null,
          endpointOwner: sample.ownerId,
        },
        witnesses: result.samples.filter(
          (o, i) =>
            o.contacts.length || o.restart || i % 20 === 0 || i === result.samples.length - 1,
        ),
      });
    }
    rows.push({
      capture: c,
      run: path,
      design: run.design,
      policy: run.policy,
      information:
        snapshot.policyRankings.find((r) => r.policy === run.policy)?.information ??
        'bounded_scene',
      before: {
        selected: original,
        candidates: snapshot.candidates,
        rankings: snapshot.policyRankings.find((r) => r.policy === run.policy)?.actions ?? null,
      },
      after: {
        selected: corrected,
        candidates: after.candidates,
        rankings: after.policyRankings.find((r) => r.policy === run.policy)?.actions ?? null,
      },
      decisionChanged:
        original && corrected ? key(original) !== key(corrected) : original !== corrected,
      unavailableCategories: options.filter((x) => !x[1]).map((x) => x[0]),
      trials,
    });
    console.log('counterfactual', rows.length, run.design, run.policy, 'trials', trials.length);
  }
}
receipt(
  'docs/performance/pr196/counterfactuals-v2.json.gz',
  {
    schema: 'pr196-real-state-counterfactuals-v2',
    sourceArchive,
    method:
      'First systematic, first pressure and last captured states per run; selection frozen without continuation results; one ordinary action then eight seconds autonomous 40Hz',
    limitations: [
      'snapshot policy inspection is distinguished from actual next-tick traces',
      'B diagnostic alternatives use full-world knowledge and are not credited as bounded player knowledge',
      'unavailable categories remain absent; hold/carry outcomes have no invented kick release',
      'horizon consequences are not direct probabilities for original delivery',
      'same-seed paired branches are dependent development evidence',
    ],
    rows,
  },
  process.argv.includes('--check'),
);
console.log(
  'real-state counterfactuals PASS',
  rows.length,
  'states',
  rows.reduce((n, r) => n + r.trials.length, 0),
  'branches',
);
