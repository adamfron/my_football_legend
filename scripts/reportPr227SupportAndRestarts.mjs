import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { selectPr224Body } from './pr224Scenarios.ts';
import { projectArticulatedBody } from '../src/core/matchSimulation/articulatedBody.ts';
import { composedLegGap } from '../src/core/matchSimulation/composedLegContact.ts';
import { withFullBodySkeleton } from '../src/core/matchSimulation/fullBodySkeleton.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';
import { captureReceptionStep } from '../src/core/matchSimulation/receptionTrace.ts';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws.ts';

const dt = 0.025;
const load = (path) => {
  const bytes = readFileSync(path);
  return {
    input: JSON.parse(gunzipSync(bytes)),
    source: { path, sha256: createHash('sha256').update(bytes).digest('hex') },
  };
};
const read = (input) => tacticalMatchStateSchema.parse(input);

const supportTransfer = () => {
  const { input, source } = load('docs/performance/pr224-native-a-halt.json.gz');
  const before = read({
    ...withFullBodySkeleton(selectPr224Body(input.before)),
    experimentalComposedLegContact: 'composed-leg-impulse-dev-v2',
    experimentalDynamicBalance: 'dynamic-balance-dev-v1',
  });
  const { state, events } = captureReceptionStep(() => stepTacticalMatch(before, dt), {
    mechanics: true,
    contactWork: true,
  });
  const bySource = (suffix) => events.filter(({ source }) => source.endsWith(suffix));
  const pair = bySource('composedLimbWork').find(({ detail }) => detail.supportTransfer);
  assert.ok(pair);
  const { actorId, detail } = pair;
  const swing = bySource('rebasePlayer').find(
    (event) => event.actorId === actorId && event.detail.swingYield,
  )?.detail.swingYield;
  const gaps = (frame) => {
    const player = frame.players.find((p) => p.id === actorId);
    const { geometry } = projectArticulatedBody(frame, player);
    const ball = { ...frame.ball, z: frame.ball.height };
    return {
      left: composedLegGap(geometry, 'left_shin', ball),
      right: composedLegGap(geometry, 'right_shin', ball),
    };
  };
  const after = stepTacticalMatch(state, dt);
  let end = after;
  for (let tick = 2; tick < 26; tick++) end = stepTacticalMatch(end, dt);
  return {
    source,
    at: before.time,
    actorId,
    contactTimeInTick: detail.atInTick,
    sharedEvents: bySource('intervalRace').filter(({ detail }) => detail.event).length,
    peakGeometrySamples: Math.max(
      0,
      ...bySource('composedLegSearch').map(({ detail }) => detail.geometrySamples),
    ),
    support: detail.supportTransfer,
    restitution: detail.parameters.restitution,
    work: {
      contactFrame: detail.account.contactFrameWork,
      fromSurfaces: detail.account.surfaceWork,
      residual: detail.account.residual,
      shins: detail.account.surfaces.map(
        ({ leg, incomingNormal, outgoingNormal, normalImpulse }) => ({
          foot: leg.foot,
          incomingNormal,
          outgoingNormal,
          normalImpulse,
        }),
      ),
    },
    swing,
    atTickEnd: { time: state.time, gaps: gaps(state), halt: state.safetyHalt ?? null },
    atNextTickEnd: { time: after.time, gaps: gaps(after), halt: after.safetyHalt ?? null },
    after650ms: { time: end.time, owner: end.ball.ownerId ?? null, halt: end.safetyHalt ?? null },
  };
};

const replayRestart = (fixture) => {
  const { input, source } = load(
    `docs/performance/pr227-refined-${fixture}-development-halt.json.gz`,
  );
  const before = read(input);
  const award = before.restart;
  const phase = (state, id) =>
    state.players.find((p) => p.id === id)?.articulatedStance?.dynamicBalance?.phase;
  let state = before;
  let firstStep;
  let placedAt;
  for (
    let tick = 0;
    tick < 60 / dt && !state.safetyHalt && state.restart.phase !== 'release';
    tick++
  ) {
    state = stepTacticalMatch(state, dt);
    assert.equal(state.restart?.awardId, award.awardId);
    if (tick === 0) firstStep = state;
    if (placedAt === undefined && state.restart.retrieval?.stage === 'placed')
      placedAt = state.time;
  }
  const legal = deriveRestartLegalReadiness(state);
  const corner = { x: award.spot.x > 52.5 ? 105 : 0, y: award.spot.y > 34 ? 68 : 0 };
  return {
    fixture,
    source,
    scenario: before.scenario,
    awardId: award.awardId,
    start: before.time,
    formerRetriever: {
      id: award.retrieval.playerId,
      balance: phase(before, award.retrieval.playerId),
    },
    formerTaker: { id: award.takerId, balance: phase(before, award.takerId) },
    newRetriever: firstStep.restart.retrieval?.playerId,
    newTaker: state.restart.takerId,
    firstStepBallDisplacement: distance(firstStep.ball, before.ball),
    placedAt,
    end: state.time,
    elapsed: state.time - before.time,
    stage: state.restart.retrieval?.stage,
    executedAt: state.restart.executedAt ?? null,
    halt: state.safetyHalt?.reason ?? null,
    ...(state.safetyHalt
      ? {
          readiness: legal,
          opponents: state.players
            .filter((p) => p.team !== award.restartTeam && distance(p.position, corner) < 10.15)
            .map((p) => ({
              id: p.id,
              balance: phase(state, p.id),
              metresFromCorner: distance(p.position, corner),
            })),
        }
      : {}),
  };
};

const archive = 'docs/performance/pr227-support-and-restarts.json';
const evidence = {
  supportTransfer: supportTransfer(),
  restarts: ['paired', 'native-a', 'independent'].map(replayRestart),
};
const serialized = JSON.stringify(evidence, null, 2) + '\n';
if (process.argv.includes('--record')) writeFileSync(archive, serialized);
else if (process.argv.includes('--check'))
  assert.deepEqual(JSON.parse(readFileSync(archive)), evidence);
else process.stdout.write(serialized);
