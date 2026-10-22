import { pr172SourceHash } from './pr172Evidence.ts';
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
const root = '.';
const load = (p) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/docs/performance/pr181-evidence/${p}.json.gz`)));
const controlled = load('controlled'),
  baseline = load('baseline-counterfactuals');
const sourceHash = pr172SourceHash();
if (
  controlled.sourceHash !== sourceHash ||
  controlled.rows.length !== 130 ||
  baseline.rows.filter((r) => r.label === 'after').some((r) => r.sourceHash !== sourceHash)
)
  throw Error('Mixed causal source');
const picks = [
  ['depth', 'prescribed-depth-release'],
  ['isolated', 'prescribed-sprint'],
  ['cross-target', 'prescribed-cross'],
  ['aerial-shoulder', 'autonomous'],
  ['aerial', 'autonomous'],
  ['covered', 'autonomous'],
];
const lean = (a) =>
  a && {
    type: a.type,
    actorId: a.actorId,
    receiverId: a.receiverId,
    intendedTargetId: a.intendedTargetId,
    target: a.target,
    requestedSpace: a.requestedSpace,
    intent: a.intent,
    delivery: a.delivery,
    movementMode: a.movementMode,
  };
const examples = controlled.rows
  .filter((r) => picks.some(([s, v]) => r.scenario === s && r.variant === v))
  .map((r) => {
    const start = r.samples[0].at - 0.025;
    const events = r.canonicalEvents.filter((e) =>
      [
        'pass',
        'through_pass',
        'pass_result',
        'cross',
        'clearance',
        'recovery',
        'possession_loss',
        'tackle',
        'challenge',
        'interception',
        'shot',
        'save',
        'block',
        'restart',
        'offside',
        'foul',
      ].includes(e.kind),
    );
    const release = events.find(
      (e) =>
        ['pass', 'through_pass', 'cross'].includes(e.kind) &&
        e.actorId === r.prescribedAction?.actorId &&
        e.at < start + 0.1,
    );
    const result =
      release && events.find((e) => e.kind === 'pass_result' && e.parentId === release.id);
    const runId = r.initial.depth[0]?.playerId;
    return {
      scenario: r.scenario,
      policy: r.policy,
      variant: r.variant,
      inputHash: r.initial.inputHash,
      autonomousRankedFirst: lean(r.ranks[0]?.action),
      prescribedAction: lean(r.prescribedAction),
      depth: r.initial.depth,
      threats: r.initial.threats,
      defence: r.initial.defence,
      press: r.initial.press,
      crossCandidates: r.initial.crosses,
      initialAerial: r.initial.aerial,
      first: r.samples[0],
      last: r.samples.at(-1),
      runnerMovement: runId
        ? r.samples.map((s) => ({
            at: s.at,
            runner: s.relevantPlayers.find((p) => p.id === runId),
          }))
        : undefined,
      release,
      result,
      canonicalEvents: events,
      aerial: r.evidence.trace.filter((e) => ['aerial', 'second_ball_recovery'].includes(e.kind)),
      eventCounts: r.evidence.events,
      peakSpeed: r.peakSpeed,
      peakBallSeparation: r.peakBallSeparation,
      finalHash: r.finalHash,
    };
  });
const depth = controlled.rows.find(
    (r) => r.scenario === 'depth' && r.policy === 'phase-role-hybrid-v1',
  ),
  id = depth.initial.depth[0].playerId;
const counterfactuals = baseline.rows
  .filter((r) => r.scenario === 'depth')
  .map((r) => ({
    policy: r.policy,
    label: r.label,
    initialHash: r.initialHash,
    runner: r.targets.find((p) => p.id === id),
    firstRank: lean(r.initialRanks[0]?.action),
    sequence: r.sequence.map((s) => ({
      time: s.time,
      runner: s.positions.find((p) => p.id === id),
      ball: s.ball,
    })),
  }));
const occupation = controlled.rows
  .filter(
    (r) =>
      ['cross-target', 'cross-false-nine', 'empty-box', 'marked-box', 'late-midfielder'].includes(
        r.scenario,
      ) && r.variant === 'autonomous',
  )
  .map((r) => ({
    scenario: r.scenario,
    policy: r.policy,
    inputHash: r.initial.inputHash,
    candidates: r.initial.crosses,
    occupations: r.initial.occupations,
  }));
const receipt = {
  schema: 'mfl-pr181-causal-v1',
  sourceHash,
  method:
    'Prescribed geometry and explicitly labelled action probes, all five policies. Natural rankings remain separate. Release/result pairs use canonical parent IDs. First/last body samples and full selected event chains are retained. These are dependent development probes, not league frequencies.',
  examples,
  counterfactuals,
  occupation,
};
writeFileSync(
  `${root}/docs/performance/pr181-evidence/causal-examples.json.gz`,
  gzipSync(JSON.stringify(receipt)),
);
writeFileSync(
  `${root}/docs/performance/PR181-causal-examples.json`,
  JSON.stringify(
    {
      schema: receipt.schema,
      sourceHash,
      method: receipt.method,
      detailedArtifact: 'pr181-evidence/causal-examples.json.gz',
      controlledArtifact: 'pr181-evidence/controlled.json.gz',
      examples: examples.map((e) => ({
        scenario: e.scenario,
        policy: e.policy,
        variant: e.variant,
        inputHash: e.inputHash,
        autonomousRankedFirst: e.autonomousRankedFirst,
        prescribedAction: e.prescribedAction,
        depth: e.depth,
        defence: e.defence,
        release: e.release,
        result: e.result,
        runnerFirst: e.runnerMovement?.[0],
        runnerLast: e.runnerMovement?.at(-1),
        peakSpeed: e.peakSpeed,
        peakBallSeparation: e.peakBallSeparation,
        aerialEvents: e.aerial.map((a) => ({
          at: a.at,
          kind: a.kind,
          outcome: a.data.outcome,
          team: a.data.team,
          winnerId: a.data.winnerId,
          contestants: a.data.contestantIds,
          challengers: a.data.challengerIds,
        })),
        losses: e.canonicalEvents.filter((a) => a.kind === 'possession_loss' && a.team === 'home')
          .length,
      })),
      occupation: occupation.map((o) => ({
        scenario: o.scenario,
        policy: o.policy,
        candidates: o.candidates.length,
        intents: [...new Set(o.candidates.map((c) => c.intent))],
      })),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    examples: examples.length,
    depth: examples
      .filter((r) => r.scenario === 'depth')
      .map((r) => ({
        policy: r.policy,
        release: !!r.release,
        result: r.result?.outcome,
        runnerStart: r.runnerMovement[0].runner?.position,
        runnerEnd: r.runnerMovement.at(-1).runner?.position,
      })),
    crossTypes: [...new Set(occupation.flatMap((r) => r.candidates.map((c) => c.intent)))],
    emptyBox: occupation.filter((r) => r.scenario === 'empty-box').map((r) => r.candidates.length),
  }),
);
