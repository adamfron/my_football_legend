import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { digest, pr182SourceHash } from './pr182Evidence.mjs';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, '').split('=');
    return [k, v.join('=')];
  }),
);
const root = resolve(args.get('source') ?? '.');
const load = (p) => import(pathToFileURL(resolve(root, p)).href);
const { createCanonicalWorldDatabase } = await load('scripts/createCanonicalWorldDatabase.ts');
const { createSingleMatchSession } = await load('src/core/singleMatch.ts');
const { createTacticalMatch, stepTacticalMatchAfterDecisionProbe } = await load(
  'src/core/matchSimulation/matchSimulation.ts',
);
const { configureMatchPolicy, fixtureIdentity } = await load(
  'src/core/matchSimulation/roleExperiment.ts',
);
const { withRankingObserver } = await load('src/core/matchSimulation/decisionObservation.ts');
const { evaluateStateValueAction, evaluateControlledState } = await load(
  'src/core/matchSimulation/decisionStateValue.ts',
);
const { deriveTacticalRolePhase } = await load('src/core/matchSimulation/roleTactics.ts');
const { tacticalRoleFor } = await load('src/core/matchSimulation/tacticalRoles.ts');
const policy = args.get('policy') ?? 'phase-role-hybrid-v1';
const out = args.get('out') ?? '../pr183-reproduce-before';
mkdirSync(out, { recursive: true });
const sourceHash = pr182SourceHash(root);
const session = createSingleMatchSession(createCanonicalWorldDatabase(), {
  homeClubId: 'pro_9',
  awayClubId: 'pro_1',
  seed: 'lab-mvh694xi',
  ...(args.has('factory-policy') ? { decisionPolicy: policy } : {}),
  control: { mode: 'spectator' },
});
let state = configureMatchPolicy(createTacticalMatch(session), policy);
state.playerAgencyEnabled = false;
const initialHash = digest(state);
const receipt = {
  schema: 'mfl-pr183-reproduction-v1',
  sourceHash,
  initialHash,
  fixtureId: fixtureIdentity(session),
  requestedFixtureId: 'fixture-b54120cf',
  policy,
  reconstruction:
    'Native canonical world, seed and clubs; original export has no complete initial state. Identity and sampled trajectories are checked, never presumed equal.',
  episodes: [],
  rankings: [],
  substitutions: [],
  anchors: [],
  samplesMatched: 0,
  samplesCompared: 0,
};
console.log(JSON.stringify({ fixtureId: receipt.fixtureId, initialHash, sourceHash }));
const manualRoot = args.get('manual-root');
const original = manualRoot
  ? JSON.parse(readFileSync(resolve(manualRoot, `lab-mvh694xi-benchmark-sesji (5)-${policy}.json`)))
  : undefined;
let originalIndex = 0,
  active,
  lastSample = -1;
const compactAction = (action) => {
  const { deliveryPlan, ...rest } = action;
  return {
    ...rest,
    ...(deliveryPlan
      ? {
          delivery: action.delivery,
          feasible: deliveryPlan.feasible,
          arrival: deliveryPlan.predictedArrivalTime,
        }
      : {}),
  };
};
const rank = (s, id, ranked) => {
  const actor = s.players.find((p) => p.id === id);
  const best = ranked[0]?.action;
  const dir = actor?.team === 'home' ? 1 : -1;
  if (
    !actor ||
    best?.type !== 'carry' ||
    dir * (best.target.x - actor.position.x) > -1 ||
    receipt.rankings.length >= 400
  )
    return;
  receipt.rankings.push({
    at: s.time,
    actorId: id,
    position: actor.position,
    phase: deriveTacticalRolePhase(s, actor.team),
    role: tacticalRoleFor(s, actor),
    coach: s.teams[actor.team].coaching,
    current: evaluateControlledState(s, actor, actor.position),
    releaseReady: s.decisionReadiness?.releaseReady,
    ranked: ranked.map((r) => ({
      action: compactAction(r.action),
      score: r.score,
      canonicalScore: r.canonicalScore,
      evaluation: evaluateStateValueAction(s, actor, r.action),
    })),
    bodies: s.players.map((p) => ({
      id: p.id,
      team: p.team,
      position: p.position,
      velocity: p.velocity,
      target: p.target,
      role: tacticalRoleFor(s, p).id,
    })),
  });
  if (active?.id === id && !active.firstRetreatState)
    active.firstRetreatState = globalThis.structuredClone(s);
};
const finish = () => {
  if (!active) return;
  const retreat = (active.start.x - active.end.x) * active.dir;
  if (retreat > 6 && active.endedAt - active.startedAt >= 3) {
    const { firstRetreatState, startState, ...summary } = active;
    const file = `${out}/retreat-${receipt.episodes.length}.json.gz`;
    writeFileSync(file, gzipSync(JSON.stringify(firstRetreatState ?? startState)));
    receipt.episodes.push({
      ...summary,
      retreat,
      stateFile: file.split(/[\\/]/).at(-1),
      stateHash: digest(firstRetreatState ?? startState),
    });
  }
};
const duration = Number(args.get('seconds') ?? 2820);
while (
  state.time < duration &&
  !['half_time', 'full_time', 'abandoned'].includes(state.status ?? '')
) {
  const previous = state;
  state = withRankingObserver(rank, () => stepTacticalMatchAfterDecisionProbe(state, 0.025));
  if (previous === state) throw Error('stalled');
  const owner = state.players.find((p) => p.id === state.ball.ownerId);
  if (active?.id !== owner?.id) {
    finish();
    active = owner
      ? {
          id: owner.id,
          team: owner.team,
          dir: owner.team === 'home' ? 1 : -1,
          startedAt: state.time,
          endedAt: state.time,
          start: { ...owner.position },
          end: { ...owner.position },
          startState: globalThis.structuredClone(state),
          samples: [],
        }
      : undefined;
  }
  if (active && owner) {
    active.endedAt = state.time;
    active.end = { ...owner.position };
    if (state.time - lastSample >= 0.5) {
      active.samples.push({
        at: state.time,
        ball: state.ball,
        pressure: state.currentPressure,
        phase: deriveTacticalRolePhase(state, owner.team),
        bodies: state.players.map((p) => ({
          id: p.id,
          position: p.position,
          velocity: p.velocity,
          target: p.target,
          intention: p.spatialMovement,
        })),
      });
      lastSample = state.time;
    }
  }
  if (
    (state.substitutionState?.pending.length ?? 0) &&
    (state.substitutionState?.pending[0]?.requestedAt ?? 0) !==
      (previous.substitutionState?.pending[0]?.requestedAt ?? 0)
  ) {
    receipt.substitutions.push({
      time: state.time,
      score: state.score,
      remaining: state.substitutionState.used,
      requests: state.substitutionState.pending,
    });
  }
  if (original)
    while (
      originalIndex < original.sampledPositioning.length &&
      original.sampledPositioning[originalIndex].time <= state.time + 1e-7
    ) {
      const sample = original.sampledPositioning[originalIndex++];
      const delta = Math.hypot(state.ball.x - sample.ball.x, state.ball.y - sample.ball.y);
      receipt.samplesCompared++;
      if (delta < 1e-6 && state.ball.ownerId === sample.ball.ownerId) receipt.samplesMatched++;
      if (
        [509, 523, 1586, 1600, 2506, 2530, 2770, 2789].some((t) => Math.abs(sample.time - t) < 0.05)
      )
        receipt.anchors.push({ at: sample.time, expected: sample.ball, actual: state.ball, delta });
    }
  if (Math.floor(state.time / 300) !== Math.floor(previous.time / 300))
    console.log(
      JSON.stringify({ time: state.time, score: state.score, retreats: receipt.episodes.length }),
    );
}
finish();
receipt.finalTime = state.time;
receipt.finalStateHash = digest(state);
receipt.score = state.score;
if (sourceHash !== pr182SourceHash(root)) throw Error('source changed during run');
writeFileSync(`${out}/receipt.json`, JSON.stringify(receipt, null, 2) + '\n');
writeFileSync(
  `${out}/initial.json.gz`,
  gzipSync(
    JSON.stringify({ session, state: configureMatchPolicy(createTacticalMatch(session), policy) }),
  ),
);
console.log(
  JSON.stringify({
    time: state.time,
    retreats: receipt.episodes.length,
    matched: receipt.samplesMatched,
    compared: receipt.samplesCompared,
  }),
);
