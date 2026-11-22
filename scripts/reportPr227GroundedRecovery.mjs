import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { groundedSupportFoot } from '../src/core/matchSimulation/articulatedBodyState.ts';
import { GROUNDED_RECOVERY_BALANCE } from '../src/core/matchSimulation/dynamicBalanceState.ts';
import { isMatchGoalkeeper } from '../src/core/matchSimulation/matchGoalkeeper.ts';
import { attacksRight, distance } from '../src/core/matchSimulation/matchSpace.ts';
import { tacticalMatchStateSchema } from '../src/core/matchSimulation/matchState.ts';
import { stepTacticalMatch } from '../src/core/matchSimulation/matchSimulation.ts';
import { deriveRestartLegalReadiness } from '../src/core/matchSimulation/restartLaws.ts';
import { canHandleRestartBall } from '../src/core/matchSimulation/restartPhase.ts';

const dt = 0.025;
const sources = [
  'pr227-followup-paired-halt',
  'pr227-followup-native-a-halt',
  'pr227-followup-independent-halt',
  'pr227-refined-independent-development-halt',
];
const balanceOf = (player) => player.articulatedStance?.dynamicBalance;
const isLost = (player) => balanceOf(player)?.phase === 'lost';
const available = (state) =>
  state.players
    .filter((p) => p.team === state.restart.restartTeam && canHandleRestartBall(state, p))
    .map((p) => p.id);

const replay = (input) => {
  const initialLost = input.players.filter(isLost);
  let state = input;
  let placedAt;
  let readinessAt;
  let assignedAt;
  const recoveredAt = new Map();
  for (
    let tick = 0;
    tick < 60 / dt && !state.safetyHalt && state.restart.phase !== 'release';
    tick++
  ) {
    state = stepTacticalMatch(state, dt);
    assert.equal(state.restart.awardId, input.restart.awardId);
    if (state.restart.retrieval) assignedAt ??= state.time;
    if (state.restart.retrieval?.stage === 'placed') placedAt ??= state.time;
    if (state.restart.readiness?.legalReady) readinessAt ??= state.time;
    for (const p of initialLost) {
      const observed = state.players.find(({ id }) => id === p.id);
      if (observed && !isLost(observed) && !recoveredAt.has(p.id))
        recoveredAt.set(p.id, state.time);
    }
  }
  const legal =
    state.restart.phase === 'release'
      ? state.restart.readiness.legalReady
      : deriveRestartLegalReadiness(state).ready;
  const taker = state.players.find((p) => p.id === state.restart.takerId);
  let after = state;
  if (state.restart.phase === 'release')
    for (
      let tick = 0;
      tick < 1 / dt && !after.safetyHalt && distance(state.ball, after.ball) < 0.3;
      tick++
    )
      after = stepTacticalMatch(after, dt);
  return {
    edition: input.experimentalDynamicBalance,
    at: state.time,
    elapsed: state.time - input.time,
    assignedAt,
    placedAt,
    readinessAt,
    firstRecoveredAt: recoveredAt.values().next().value,
    numberRecovered: recoveredAt.size,
    taker: taker?.id,
    takerIsGoalkeeper: Boolean(taker && isMatchGoalkeeper(taker)),
    stage: state.restart.retrieval?.stage,
    phase: state.restart.phase,
    executedAt: state.restart.executedAt,
    action: state.restart.selectedAction?.type,
    ...(state.restart.phase === 'release'
      ? {
          ballMovement: {
            metres: distance(state.ball, after.ball),
            at: after.time,
            halt: after.safetyHalt?.reason ?? null,
          },
        }
      : {}),
    halt: state.safetyHalt?.reason ?? null,
    legalReady: legal,
    blockers: state.restart.readiness?.blockers,
  };
};

const cases = sources.map((name) => {
  const path = `docs/performance/${name}.json.gz`;
  const source = readFileSync(path);
  const input = tacticalMatchStateSchema.parse(JSON.parse(gunzipSync(source)));
  const award = input.restart;
  assert.ok(award?.spot);
  const opposingCorner = {
    x: attacksRight(award.restartTeam, input) ? 105 : 0,
    y: award.spot.y <= 34 ? 0 : 68,
  };
  return {
    source: { path, sha256: createHash('sha256').update(source).digest('hex') },
    start: input.time,
    award: {
      id: award.awardId,
      team: award.restartTeam,
      scenario: input.scenario,
      spot: award.spot,
    },
    available: available(input),
    lost: input.players.filter(isLost).map((player) => ({
      id: player.id,
      team: player.team,
      groundedSupport: groundedSupportFoot(player.articulatedStance, player.verticalJump?.height),
      mostRecentLoad: balanceOf(player)?.lastLoad?.source,
      ...(input.scenario === 'corner' && player.team !== award.restartTeam
        ? { metresFromCorner: distance(player.position, opposingCorner) }
        : {}),
    })),
    ...(input.scenario === 'kick_off'
      ? {
          playersInOtherHalf: input.players
            .filter(
              (p) =>
                p.id !== award.takerId &&
                (attacksRight(p) ? p.position.x > 52.51 : p.position.x < 52.49),
            )
            .map((p) => p.id),
        }
      : {}),
    previous: replay(input),
    current: replay({ ...input, experimentalDynamicBalance: GROUNDED_RECOVERY_BALANCE }),
  };
});
assert.ok(
  cases.every(
    ({ previous, current }) =>
      previous.halt &&
      current.executedAt &&
      current.legalReady &&
      current.ballMovement.metres >= 0.3 &&
      !current.ballMovement.halt,
  ),
);
const archive = 'docs/performance/pr227-grounded-recovery.json';
const serialized = JSON.stringify({ cases }, null, 2) + '\n';
if (process.argv.includes('--record')) writeFileSync(archive, serialized);
else if (process.argv.includes('--check'))
  assert.deepEqual(JSON.parse(serialized), JSON.parse(readFileSync(archive)));
else process.stdout.write(serialized);
