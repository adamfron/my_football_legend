// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFormationBenchmarkMatch } from './benchmarkFixtures';
import { npcPossessionDecisionDelay, resolveMatchAction } from './matchActions';
import { deriveOnBallPreparation } from './onBallPreparation';
import {
  deriveBuildUpSupport,
  deriveDepthRunAssignments,
  deriveTacticalTargets,
} from './tacticalPositioning';
import { awardNaturalRestart } from './restartScenarios';
import { prepareRestartMovement } from './restartLifecycle';
import { FIXED_MATCH_DT, stepTacticalMatchAfterDecisionProbe } from './matchSimulation';
import { distance } from './matchSpace';
import { predictReachableRun } from './reachableSpace';
import { evaluatePassDecision } from './passDecision';
import { resolveGroundPassClaim, groundPassClaimSchema } from './passClaimResolver';
import { projectReceiverReadiness } from './receiverReadiness';
import { resolveReceptionOutcome, receptionOutcomeSchema } from './passReception';
import { tacticalMatchStateSchema } from './matchState';
import { teamThreatMemorySchema } from './teamThreatMemory';

const fixture = (formation: '4-4-2' | '4-3-3' = '4-4-2') => {
  const state = createFormationBenchmarkMatch({
    anchor: formation,
    opponent: '4-4-2',
    seed: 'pr162-behaviour',
  }).state;
  delete state.restart;
  state.scenario = 'open_play';
  state.time = 10;
  state.players = state.players.map((p) => ({
    ...p,
    position: { x: p.team === 'home' ? 45 : 79, y: 8 + p.slotIndex * 5 },
    velocity: { x: 0, y: 0 },
  }));
  const carrier = state.players.find((p) => p.team === 'home' && p.slotIndex === 5)!;
  carrier.position = { x: 62, y: 34 };
  state.ball = { ...carrier.position, ownerId: carrier.id };
  state.possessionTeam = 'home';
  state.ballOwnershipStartedAt = state.time;
  state.currentPressure = 0;
  state.teams.home.phase = 'positional_attack';
  return { state, carrier };
};

describe('PR162 causal football corrections', () => {
  it.each([-0.0324, 68.0324])(
    'retains a real near-line pass origin in tactical memory at y=%s',
    (y) => {
      const { state, carrier } = fixture();
      carrier.position = { x: 45, y: y < 0 ? 0.3 : 67.7 };
      const receiver = state.players.find((p) => p.team === 'home' && p.slotIndex === 6)!;
      receiver.position = { x: 60, y: y < 0 ? 8 : 60 };
      state.ball = { x: 45, y, height: 0.11, ownerId: carrier.id };
      state.ballOwnershipStartedAt = state.time - 2;
      state.onBallPreparation = deriveOnBallPreparation(
        { ...state, time: state.time - 2 },
        carrier,
        'clean_control',
      );
      const origin = { x: state.ball.x, y: state.ball.y };
      let next = resolveMatchAction(state, {
        type: 'pass',
        actorId: carrier.id,
        receiverId: receiver.id,
        target: receiver.position,
        intent: 'support',
      });
      const passId = next.lastPassDiagnostic?.passId;
      expect(next.ball.travelKind).toBe('pass');
      expect(next.ball.from).toEqual(origin);
      for (
        let tick = 0;
        tick < 240 &&
        !next.teams.home.threatMemory?.recentSolutions.some((entry) => entry.id === passId);
        tick++
      )
        next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
      const entry = next.teams.home.threatMemory?.recentSolutions.find(
        (candidate) => candidate.id === passId,
      );
      expect(entry?.origin).toEqual(origin);
      expect(entry?.outcome).toBeDefined();
      expect(teamThreatMemorySchema.safeParse(next.teams.home.threatMemory).success).toBe(true);
      expect(tacticalMatchStateSchema.safeParse(next).success).toBe(true);
      expect(
        teamThreatMemorySchema.safeParse({ ...next.teams.home.threatMemory, controlOrigin: origin })
          .success,
      ).toBe(true);
      expect(
        teamThreatMemorySchema.safeParse({
          ...next.teams.home.threatMemory,
          controlOrigin: { x: Infinity, y },
        }).success,
      ).toBe(false);
    },
  );
  it('preserves a partly beyond-line physical ground-pass contact coordinate', () => {
    const { state } = fixture();
    const point = { x: 45, y: -0.0324 };
    expect(resolveGroundPassClaim(state, point).landingPosition).toEqual(point);
    const receiver = state.players.find((p) => p.team === 'home' && p.slotIndex === 6)!;
    receiver.position = { x: 45, y: 0.4 };
    expect(projectReceiverReadiness(state, receiver, point, 0).contactPoint).toEqual(point);
    const outcome = resolveReceptionOutcome(state, receiver, point);
    expect(receptionOutcomeSchema.parse(outcome).contactPoint).toEqual(point);
    expect(groundPassClaimSchema.safeParse({ landingPosition: { x: NaN, y: 0 } }).success).toBe(
      false,
    );
  });
  it('uses real scoring distance and never shortens physical control readiness under pressure', () => {
    const { state, carrier } = fixture();
    carrier.position = { x: 84, y: 34 };
    state.ball = { ...carrier.position, ownerId: carrier.id };
    state.onBallPreparation = deriveOnBallPreparation(state, carrier, 'clean_control');
    expect(npcPossessionDecisionDelay(state, carrier)).toBeCloseTo(
      Math.max(0.4, state.onBallPreparation.readyAt - state.onBallPreparation.gainedAt),
    );
    state.onBallPreparation.readyAt = state.time + 1.7;
    state.currentPressure = 1;
    expect(npcPossessionDecisionDelay(state, carrier)).toBeCloseTo(1.7);
  });
  it('keeps one average forward on the line without consuming the build-up support job', () => {
    const { state } = fixture();
    const forwards = state.players.filter(
      (p) => p.team === 'home' && p.slot.position === 'striker',
    );
    forwards[0]!.position = { x: 68, y: 26 };
    forwards[1]!.position = { x: 70, y: 42 };
    const runs = deriveDepthRunAssignments(state, 'home');
    expect(runs).toHaveLength(1);
    expect(runs[0]!.playerId).toBe(forwards[1]!.id);
    expect(runs[0]!.target.x).toBeGreaterThan(75);
    expect(runs[0]!.target.x).toBeLessThan(79);
    expect(deriveBuildUpSupport(state, 'home').some((p) => p.playerId === runs[0]!.playerId)).toBe(
      false,
    );
    expect(
      deriveTacticalTargets(state).find((p) => p.id === runs[0]!.playerId)!.idealTarget!.x,
    ).toBe(runs[0]!.target.x);
  });
  it('compensates a lone striker dropping with an already advanced winger, with no depth job without control', () => {
    const { state } = fixture('4-3-3');
    state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!.position = {
      x: 58,
      y: 34,
    };
    const winger = state.players.find(
      (p) => p.team === 'home' && p.slot.position === 'left_winger',
    )!;
    winger.position = { x: 70, y: 12 };
    expect(deriveDepthRunAssignments(state, 'home')[0]).toMatchObject({
      playerId: winger.id,
      role: 'compensate_drop',
    });
    delete state.ball.ownerId;
    expect(deriveDepthRunAssignments(state, 'home')).toEqual([]);
  });
  it('accounts for fatigue in reachable runs without modifying the player or consuming randomness', () => {
    const { carrier } = fixture();
    carrier.target = { x: 100, y: 34 };
    carrier.fitness!.longTermCapacity = 1;
    carrier.fitness!.burstReadiness = 1;
    const fresh = predictReachableRun(carrier).points.at(-1)!.position.x;
    carrier.fitness!.longTermCapacity = 0.35;
    carrier.fitness!.burstReadiness = 0.2;
    const frozen = JSON.stringify(carrier);
    expect(predictReachableRun(carrier).points.at(-1)!.position.x).toBeLessThan(fresh);
    expect(JSON.stringify(carrier)).toBe(frozen);
  });
  it('does not count a defender beyond the passer as occupying the travelling pass corridor', () => {
    const { state, carrier } = fixture();
    const receiver = state.players.find((p) => p.team === 'home' && p.slotIndex === 6)!;
    receiver.position = { x: 72, y: 34 };
    state.players
      .filter((p) => p.team === 'away')
      .forEach((p) => {
        p.position = { x: 90, y: 4 };
      });
    state.players.find((p) => p.team === 'away' && p.slotIndex === 2)!.position = { x: 60, y: 34 };
    const forecast = evaluatePassDecision(state, carrier, receiver, receiver.position, 'direct');
    expect(forecast.laneOccupation).toBe(0);
  });
  it('clears a secondary teammate from the actual placement body endpoint and releases through physics', () => {
    const { state } = fixture();
    let restart = awardNaturalRestart(
      { ...state, ball: { x: 30, y: 59, height: 0 } },
      'free_kick_far',
      {
        restartTeam: 'home',
        incidentId: 'pr162-placement',
        incidentPoint: { x: 30, y: 59 },
        cause: 'foul',
      },
    );
    const taker = restart.players.find((p) => p.id === restart.restart!.takerId)!;
    const mate = restart.players.find((p) => p.team === 'home' && p.id !== taker.id)!;
    const endpoint = { x: 31, y: 59.5 };
    taker.position = { ...endpoint };
    mate.position = { x: 32, y: 59.5 };
    restart.restart!.retrieval = {
      playerId: taker.id,
      stage: 'transport',
      attachedOffset: { x: -1, y: -0.5 },
    };
    restart.restart!.targets[mate.id] = { ...mate.position };
    const prepared = prepareRestartMovement(restart);
    expect(
      distance(prepared.players.find((p) => p.id === mate.id)!.target, endpoint),
    ).toBeGreaterThanOrEqual(2.5);
    expect(prepared.ball).toEqual(restart.ball);
    const award = restart.restart!.awardId;
    for (let tick = 0; tick < 1200 && restart.restart?.awardId === award; tick++)
      restart = stepTacticalMatchAfterDecisionProbe(restart, FIXED_MATCH_DT);
    expect(restart.restart?.awardId).not.toBe(award);
    expect(restart.time - state.time).toBeLessThan(30);
  });
  it('stages a different goal-kick taker inward when the original clearance direction leaves the pitch', () => {
    const { state } = fixture();
    const spot = { x: 0, y: 43.16 };
    let restart = awardNaturalRestart({ ...state, ball: { ...spot, height: 0 } }, 'goal_kick', {
      restartTeam: 'home',
      incidentId: 'pr162-line-placement',
      incidentPoint: spot,
      cause: 'boundary',
    });
    const keeper = restart.players.find((p) => p.id === restart.restart!.takerId)!;
    const retriever = restart.players.find((p) => p.team === 'home' && p.slotIndex === 2)!;
    const endpoint = { x: 1.0775, y: 43.3338 };
    keeper.position = { x: 0.4, y: 43.16 };
    retriever.position = { ...endpoint };
    restart.restart!.retrieval = {
      playerId: retriever.id,
      stage: 'transport',
      attachedOffset: { x: -1.0775, y: -0.1738 },
    };
    const prepared = prepareRestartMovement(restart);
    expect(
      distance(prepared.players.find((p) => p.id === keeper.id)!.target, endpoint),
    ).toBeGreaterThanOrEqual(2.5);
    expect(prepared.ball).toEqual(restart.ball);
    const award = restart.restart!.awardId;
    for (let tick = 0; tick < 1200 && restart.restart?.awardId === award; tick++)
      restart = stepTacticalMatchAfterDecisionProbe(restart, FIXED_MATCH_DT);
    expect(restart.restart?.awardId).not.toBe(award);
    expect(restart.time - state.time).toBeLessThan(30);
  });
});
