import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  withBoundedObserver,
  inspectBoundedAction,
} from '../src/core/matchSimulation/boundedIntelligence.ts';
import { releaseContactReadiness } from '../src/core/matchSimulation/decisionReadiness.ts';
import {
  deriveDefensiveContext,
  derivePressingPlan,
} from '../src/core/matchSimulation/defensiveChallenges.ts';
import {
  capturePathologicalState,
  restorePathologicalState,
} from '../src/core/matchSimulation/pathologicalReplay.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { resolveMatchAction } from '../src/core/matchSimulation/matchActions.ts';

const root = 'docs/performance/pr189';
const version = process.argv.find((v) => v.startsWith('--version='))?.slice(10);
const suffix = version ? `-${version}` : process.argv.includes('--v2') ? '-v2' : '';
const check = process.argv.includes('--check');
const output = `${root}/replay-labs${suffix}.json`;
if (existsSync(output) && !check) throw Error('Preserve replay evidence');
const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clone = (v) => JSON.parse(JSON.stringify(v));
const capture = (seconds = 20) =>
  JSON.parse(gunzipSync(readFileSync(`${root}/baseline-${seconds}s.json.gz`)));
const summaries = [],
  traces = [];
const run = (initial, observed = true, maxTicks = 160) => {
  let state = clone(initial),
    firstRelease = null;
  const events = [],
    frames = [];
  state = withBoundedObserver(
    observed
      ? (t) => {
          events.push(t);
        }
      : undefined,
    () => {
      for (let i = 0; i < maxTicks; i++) {
        const actor = state.players.find((p) => p.id === state.ball.ownerId);
        if (observed && actor?.id === initial.ball.ownerId && i < 24) {
          const b = inspectBoundedAction(state, actor);
          frames.push({
            at: state.time,
            owner: actor.id,
            footWindow: releaseContactReadiness(state, actor),
            selected: b.decision.selectedCandidateId,
            preparing: b.decision.preparationCandidateId,
            lastContact: state.lastGroundContact,
            body: { position: actor.position, velocity: actor.velocity, facing: actor.facingAngle },
            preparation: state.onBallPreparation,
          });
        }
        const before = state;
        state = step(state, 0.025);
        if (
          !firstRelease &&
          state.lastPassDiagnostic?.passId !== initial.lastPassDiagnostic?.passId
        )
          firstRelease = {
            at: state.time,
            seconds: state.time - initial.time,
            diagnostic: state.lastPassDiagnostic,
            ball: state.ball,
            statistics: state.statistics,
          };
        if (state === before) break;
      }
      return state;
    },
  );
  return {
    state,
    firstRelease,
    frames,
    events,
    stateSha256: sha(state),
    eventsSha256: sha(events),
  };
};
for (const seconds of [0, 20, 60, 300, 1200, 1984]) {
  const initial = restorePathologicalState(capture(seconds));
  const observed = run(initial),
    replay = run(restorePathologicalState(capture(seconds))),
    bare = run(initial, false);
  const first = observed.firstRelease;
  summaries.push({
    seconds,
    classification: 'exact captured baseline state; modified engine continuation',
    firstReleaseAfter: first?.seconds ?? null,
    passer: first?.diagnostic.passerId ?? null,
    receiver: first?.diagnostic.intendedReceiverId ?? null,
    releaseVelocity: first?.ball.velocity ?? null,
    finalStateSha256: observed.stateSha256,
    replayStateSha256: replay.stateSha256,
    bareStateSha256: bare.stateSha256,
    eventHashes: [observed.eventsSha256, replay.eventsSha256],
    deterministic:
      observed.stateSha256 === replay.stateSha256 &&
      observed.stateSha256 === bare.stateSha256 &&
      observed.eventsSha256 === replay.eventsSha256,
  });
  if (seconds === 20) {
    traces.push({ seconds, frames: observed.frames, events: observed.events, firstRelease: first });
    if (!check)
      writeFileSync(
        `${root}/repaired-after-4s${suffix}.json.gz`,
        gzipSync(
          JSON.stringify(
            capturePathologicalState(
              observed.state,
              'a74be9ee846ac4958fd67e42795cf3d86946e937',
              'modified PR189 engine continuation; see source manifests',
            ),
          ),
        ),
      );
  }
}

// Controlled Lab B neighbours are explicit reconstructed initial conditions,
// not exact replays. A human retain action reserves agency; it does not freeze
// the carrier, defence, ball, movement, challenges, fitness or rules.
const defence = [];
for (const covers of [0, 1, 2])
  for (const exposed of [false, true]) {
    let state = restorePathologicalState(capture());
    const actor = state.players.find((p) => p.id === state.ball.ownerId);
    const foes = state.players
      .filter((p) => p.team !== actor.team && p.slot.position !== 'goalkeeper')
      .sort((a, b) => distance(a.position, actor.position) - distance(b.position, actor.position));
    for (const [i, p] of foes.entries()) {
      p.position =
        i === 0
          ? { x: actor.position.x + 2.2, y: actor.position.y }
          : i <= covers
            ? { x: actor.position.x + 8 + i, y: actor.position.y + i * 2 }
            : { x: 5, y: 5 + i * 5 };
      p.velocity = { x: 0, y: 0 };
      p.facingAngle = -Math.PI / 2;
    }
    state.ball = {
      ...state.ball,
      x: actor.position.x + (exposed ? 0.45 : -0.45),
      y: actor.position.y,
      velocity: { x: 0, y: 0, z: 0 },
    };
    state.playerAgencyEnabled = true;
    state.controlledFootballerId = actor.id;
    state = resolveMatchAction(
      state,
      { type: 'carry', actorId: actor.id, target: actor.position, movementMode: 'retain' },
      'human_selected',
    );
    const initialPlan = derivePressingPlan(state, foes[0].id, null);
    const initialContext = deriveDefensiveContext(state, foes[0].id);
    const startedAt = state.time;
    let minBallDistance = Infinity,
      minBodyDistance = Infinity,
      firstChallenge = null;
    for (let i = 0; i < 160; i++) {
      state = step(state, 0.025);
      const p = state.players.find((p) => p.id === foes[0].id),
        a = state.players.find((p) => p.id === actor.id);
      minBallDistance = Math.min(minBallDistance, distance(p.position, state.ball));
      minBodyDistance = Math.min(minBodyDistance, distance(p.position, a.position));
      if (!firstChallenge && state.lastChallenge?.at >= startedAt)
        firstChallenge = state.lastChallenge;
    }
    defence.push({
      covers,
      exposed,
      classification: 'reconstructed neighbour; canonical human retain and autonomous defenders',
      initialPlan,
      initialDistances: {
        body: initialContext.opponentDistance,
        ball: initialContext.ballDistance,
      },
      minBallDistance,
      minBodyDistance,
      firstChallenge,
      ownerAfter: state.ball.ownerId,
      defence: state.defensiveTelemetry,
    });
  }
const historical = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const historicalState = JSON.parse(gunzipSync(readFileSync(historical.archive))).finalState;
const diagnosisState = JSON.parse(
  gunzipSync(readFileSync('docs/performance/PR188-possession-diagnosis.json.gz')),
).finalState;
const history = {
  historicalRawHash: sha(historicalState),
  diagnosisRawHash: sha(diagnosisState),
  sameValues: isDeepStrictEqual(historicalState, diagnosisState),
  differentKeyOrderOnly:
    isDeepStrictEqual(historicalState, diagnosisState) &&
    sha(historicalState) !== sha(diagnosisState),
};
if (check) {
  const saved = JSON.parse(readFileSync(output));
  if (
    !isDeepStrictEqual(summaries, saved.summaries) ||
    !isDeepStrictEqual(defence, saved.defence) ||
    !isDeepStrictEqual(history, saved.history)
  )
    throw Error('Current canonical replay differs');
  console.log('PR189 six captured states, physical neighbours and observer replay PASS');
} else {
  writeFileSync(`${root}/release-trace${suffix}.json.gz`, gzipSync(JSON.stringify(traces)));
  writeFileSync(
    output,
    JSON.stringify(
      {
        schemaVersion: 1,
        summaries,
        defence,
        history,
        runnerSha256: sha(
          readFileSync('scripts/benchmarkPr189Replay.mjs', 'utf8').replaceAll('\r\n', '\n'),
        ),
      },
      null,
      2,
    ) + '\n',
  );
}
console.log(
  JSON.stringify({
    summaries,
    defence: defence.map((d) => ({
      covers: d.covers,
      exposed: d.exposed,
      intention: d.initialPlan.intention,
      minBallDistance: d.minBallDistance,
      firstChallenge: d.firstChallenge?.outcome,
    })),
    history,
  }),
);
if (summaries.some((r) => !r.deterministic || r.firstReleaseAfter === null)) process.exitCode = 1;
