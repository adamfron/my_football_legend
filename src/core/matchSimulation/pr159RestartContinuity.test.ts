// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { RandomGenerator } from '../random/RandomGenerator';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { awardNaturalRestart } from './restartScenarios';
import { enumerateRestartActions, resolveMatchAction } from './matchActions';
import {
  advanceRestartPlacement,
  canExecutePreparedRestart,
  prepareRestartMovement,
  replaceUnavailableRestartTaker,
} from './restartLifecycle';
import { legalizeRestartPlayerTarget } from './restartLaws';
import {
  beginStoppage,
  elapsedDeadBallSeconds,
  endStoppage,
  markStoppageReady,
  stoppageLedgerSchema,
} from './stoppageLedger';
import {
  tacticalMatchStateSchema,
  type MatchAction,
  type RestartScenario,
  type TacticalMatchState,
} from './matchState';

const world = createCanonicalWorldDatabase();
const fixture = (seed = 'pr159-continuity'): TacticalMatchState => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const { restart: _restart, ...state } = initial;
  void _restart;
  return { ...state, scenario: 'open_play', playerAgencyEnabled: false, actionCooldown: 20 };
};
const award = (scenario: RestartScenario = 'free_kick_wide', seed?: string) =>
  awardNaturalRestart(fixture(seed), scenario, {
    restartTeam: 'home',
    incidentId: `${seed ?? 'pr159'}:${scenario}:incident`,
    incidentPoint: { x: 78.125, y: 8.75 },
    eventAt: 0,
    cause: 'foul',
  });
/** Explicit deterministic fixture construction. Canonical setup thereafter may only move bodies. */
const physicallyPrepared = (scenario: RestartScenario = 'free_kick_wide'): TacticalMatchState => {
  let state = award(scenario);
  state = {
    ...state,
    ball: {
      ...state.restart!.spot!,
      ownerId: state.restart!.takerId,
      velocity: { x: 0, y: 0, z: 0 },
    },
    restart: {
      ...state.restart!,
      retrieval: { playerId: state.restart!.takerId, stage: 'placed' },
    },
    players: state.players.map((player) => ({
      ...player,
      position: legalizeRestartPlayerTarget(
        state,
        player,
        state.restart!.targets[player.id] ?? player.position,
      ),
      velocity: { x: 0, y: 0 },
    })),
  };
  return advanceRestartPlacement(state, 0);
};
const tickUntil = (
  initial: TacticalMatchState,
  predicate: (state: TacticalMatchState) => boolean,
  ticks = 1600,
) => {
  let state = initial;
  for (let tick = 0; tick < ticks && !predicate(state); tick++)
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  return state;
};

describe('PR159 live incident identity and physical restart continuity', () => {
  it('preserves current player positions and velocities, the ball and physical action history on award', () => {
    const initial = fixture();
    const actor = initial.players.find((player) => player.team === 'home')!;
    const currentAction: MatchAction = {
      type: 'carry',
      actorId: actor.id,
      target: { x: 78, y: 9 },
    };
    const state = {
      ...initial,
      time: 123.5,
      players: initial.players.map((player) => ({ ...player, velocity: { x: 2.1, y: -0.3 } })),
      ball: { x: 79, y: 9, height: 0.12, velocity: { x: 4, y: -1 }, lastTouchPlayerId: actor.id },
      currentAction,
      latestAction: currentAction,
    };
    const before = structuredClone(state);
    const next = awardNaturalRestart(state, 'free_kick_wide', {
      restartTeam: 'home',
      incidentId: 'physical-foul-123',
      incidentPoint: { x: 78.125, y: 8.75 },
      eventAt: 123.25,
      cause: 'foul',
    });
    expect(next.restart).toMatchObject({
      phase: 'preparing',
      origin: 'live_event',
      spot: { x: 78.125, y: 8.75 },
      startedAt: 123.5,
    });
    expect(next.lastRestartAward).toMatchObject({
      incidentId: 'physical-foul-123',
      eventAt: 123.25,
      incidentPosition: { x: 78.125, y: 8.75 },
      legalRestartPosition: { x: 78.125, y: 8.75 },
    });
    expect(next.ball).toMatchObject({ x: 79, y: 9, height: 0.12, velocity: { x: 4, y: -1 } });
    expect(next.players.map((player) => [player.position, player.velocity])).toEqual(
      state.players.map((player) => [player.position, player.velocity]),
    );
    expect(next.currentAction).toBeUndefined();
    expect(next.latestAction).toEqual(currentAction);
    expect(next.statistics).toEqual(state.statistics);
    expect(state).toEqual(before);
    expect(
      awardNaturalRestart(next, 'free_kick_wide', {
        restartTeam: 'home',
        incidentId: 'physical-foul-123',
        cause: 'foul',
      }),
    ).toBe(next);
  });
  it.each([
    {
      scenario: 'throw_in',
      lastTeam: 'home',
      point: { x: 58, y: 0.02 },
      velocity: { x: 4, y: -16 },
      target: { x: 60, y: -8 },
      restartTeam: 'away',
    },
    {
      scenario: 'corner',
      lastTeam: 'away',
      point: { x: 104.9, y: 6 },
      velocity: { x: 20, y: 0 },
      target: { x: 110, y: 6 },
      restartTeam: 'home',
    },
    {
      scenario: 'goal_kick',
      lastTeam: 'home',
      point: { x: 104.9, y: 6 },
      velocity: { x: 20, y: 0 },
      target: { x: 110, y: 6 },
      restartTeam: 'away',
    },
  ] as const)(
    'physically awards $scenario from a live boundary crossing',
    ({ scenario, lastTeam, point, velocity, target, restartTeam }) => {
      const initial = fixture(`pr159-boundary-${scenario}`);
      const last = initial.players.find((player) => player.team === lastTeam)!;
      const state: TacticalMatchState = {
        ...initial,
        players: initial.players.map((player, index) => ({
          ...player,
          position: { x: 20 + index, y: 40 },
          target: { x: 20 + index, y: 40 },
          velocity: { x: 0, y: 0 },
        })),
        ball: {
          ...point,
          from: point,
          target,
          velocity,
          height: 0,
          airborne: false,
          travelKind: 'pass',
          sourceAction: 'pass',
          lastTouchPlayerId: last.id,
        },
      };
      const next = tickUntil(state, (current) => current.restart?.origin === 'live_event', 8);
      expect(next.scenario).toBe(scenario);
      expect(next.restart).toMatchObject({ origin: 'live_event', phase: 'preparing', restartTeam });
      expect(next.lastRestartAward?.incidentPosition).toEqual(next.lastBoundaryCrossing?.point);
      if (scenario === 'throw_in')
        expect(next.restart?.spot).toEqual(next.lastBoundaryCrossing?.point);
      expect(
        next.players.every((player) => {
          const previous = state.players.find((before) => before.id === player.id)!;
          return (
            Math.hypot(
              player.position.x - previous.position.x,
              player.position.y - previous.position.y,
            ) < 1
          );
        }),
      ).toBe(true);
    },
  );
  it('starts the second half with an away kickoff and preserves bodies until physical release', () => {
    const initial = fixture('pr159-second-half');
    const halfTime: TacticalMatchState = {
      ...initial,
      status: 'half_time',
      time: 2700,
      ball: { x: 91.25, y: 51.5, height: 0, velocity: { x: 0.25, y: -0.1, z: 0 } },
      players: initial.players.map((player) => ({ ...player, velocity: { x: 0.4, y: -0.2 } })),
    };
    const started = startSecondHalf(halfTime);
    expect(started.status).toBe('second_half');
    expect(started.time).toBe(2700);
    expect(started.ball).toMatchObject(halfTime.ball);
    expect(
      started.players.map((player) => ({ position: player.position, velocity: player.velocity })),
    ).toEqual(
      halfTime.players.map((player) => ({ position: player.position, velocity: player.velocity })),
    );
    expect(started.restart).toMatchObject({
      phase: 'preparing',
      origin: 'live_event',
      restartTeam: 'away',
      spot: { x: 52.5, y: 34 },
    });
    expect(started.players.find((player) => player.id === started.restart?.takerId)?.team).toBe(
      'away',
    );
    expect(started.restart?.executedAt).toBeUndefined();
    expect(started.stoppageLedger?.active).toMatchObject({
      awardId: started.lastRestartAward!.id,
      startedAt: 2700,
      reasons: ['period_start'],
    });
    const released = tickUntil(started, (state) =>
      Boolean(
        state.stoppageLedger?.intervals.some(
          (interval) =>
            interval.awardId === started.lastRestartAward!.id && interval.endReason === 'execution',
        ),
      ),
    );
    const execution = released.stoppageLedger?.intervals.find(
      (interval) => interval.awardId === started.lastRestartAward!.id,
    );
    expect(execution?.executedAt).toBeGreaterThan(2700);
    expect(execution?.executedAt).toBeLessThan(2740);
    expect(released.lastRestartAward?.id).toBe(started.lastRestartAward!.id);
    expect(tacticalMatchStateSchema.safeParse(released).success).toBe(true);
  });
  it('reassigns an unavailable taker within the same award and preserves the current physical state', () => {
    const state = award();
    const unavailable: TacticalMatchState = {
      ...state,
      players: state.players.filter((player) => player.id !== state.restart!.takerId),
    };
    const replaced = replaceUnavailableRestartTaker(unavailable);
    expect(replaced.restart?.takerId).not.toBe(state.restart!.takerId);
    expect(replaced.restart?.awardId).toBe(state.restart!.awardId);
    expect(replaced.restart?.startedAt).toBe(state.restart!.startedAt);
    expect(replaced.lastRestartAward?.id).toBe(state.lastRestartAward!.id);
    expect(replaced.stoppageLedger).toEqual(state.stoppageLedger);
    expect(replaced.ball).toEqual(unavailable.ball);
    expect(replaced.players.map((player) => player.position)).toEqual(
      unavailable.players.map((player) => player.position),
    );
  });
  it('reassigns an unavailable retriever while retaining a valid taker and the original incident', () => {
    const state = award();
    const retriever = state.players.find(
      (player) => player.team === 'home' && player.id !== state.restart!.takerId,
    )!;
    const unavailable: TacticalMatchState = {
      ...state,
      restart: { ...state.restart!, retrieval: { playerId: retriever.id, stage: 'approach' } },
      players: state.players.filter((player) => player.id !== retriever.id),
    };
    const replaced = prepareRestartMovement(unavailable);
    expect(replaced.restart?.takerId).toBe(state.restart!.takerId);
    expect(replaced.restart?.retrieval?.playerId).not.toBe(retriever.id);
    expect(replaced.lastRestartAward?.id).toBe(state.lastRestartAward!.id);
    expect(replaced.stoppageLedger).toEqual(state.stoppageLedger);
    expect(replaced.ball).toEqual(unavailable.ball);
  });
});

describe('PR159 controlled restart decision is committed before physical execution', () => {
  it.each(['kick_off', 'goal_kick', 'corner', 'free_kick_wide', 'penalty'] as const)(
    'rejects all autonomous paths for controlled %s before RNG or accounting',
    (scenario) => {
      const prepared = physicallyPrepared(scenario);
      const state: TacticalMatchState = {
        ...prepared,
        playerAgencyEnabled: true,
        controlledFootballerId: prepared.restart!.takerId,
      };
      const action = enumerateRestartActions(state)[0]!;
      expect(action).toBeDefined();
      const random = vi.spyOn(RandomGenerator.prototype, 'float');
      try {
        const before = structuredClone(state);
        for (const source of [
          'autonomous_npc',
          'autonomous_routine',
          'dev_ai_selected',
          'restart_liveness_watchdog',
        ] as const) {
          random.mockClear();
          expect(resolveMatchAction(state, action, source)).toBe(state);
          expect(random).not.toHaveBeenCalled();
          expect(state).toEqual(before);
        }
      } finally {
        random.mockRestore();
      }
    },
  );
  it('queues one explicit human pass then releases it through canonical preparation', () => {
    const prepared = physicallyPrepared('free_kick_wide');
    const state: TacticalMatchState = {
      ...prepared,
      playerAgencyEnabled: true,
      controlledFootballerId: prepared.restart!.takerId,
      restart: { ...prepared.restart!, phase: 'awaiting_decision' },
    };
    const action = enumerateRestartActions(state).find((candidate) => candidate.type === 'pass')!;
    expect(action).toBeDefined();
    const random = vi.spyOn(RandomGenerator, 'fromSeed');
    let selected: TacticalMatchState;
    try {
      selected = resolveMatchAction(state, action, 'human_selected');
      expect(
        random.mock.calls.every(
          ([seed]) => seed.includes(':restart:') || seed.startsWith('separate:'),
        ),
      ).toBe(true);
    } finally {
      random.mockRestore();
    }
    expect(selected.restart).toMatchObject({
      phase: 'kick_preparation',
      selectedAction: action,
      selectedSource: 'human_selected',
    });
    expect(selected.ball).toEqual(state.ball);
    expect(selected.actionEvents ?? []).toEqual(state.actionEvents ?? []);
    expect(selected.statistics).toEqual(state.statistics);
    expect(selected.decisionIndex).toBe(state.decisionIndex);
    expect(canExecutePreparedRestart(selected)).toBe(false);
    expect(resolveMatchAction(selected, action, 'human_selected').restart?.selectedAction).toEqual(
      action,
    );
    const released = tickUntil(selected, (current) => current.restart?.phase === 'release', 160);
    expect(released.restart?.phase).toBe('release');
    expect(released.restart?.executedAt).toBeGreaterThan(state.time);
    expect(released.latestActionSource).toBe('human_selected');
    expect(
      Math.hypot(released.ball.velocity?.x ?? 0, released.ball.velocity?.y ?? 0),
    ).toBeGreaterThan(0);
    expect(released.stoppageLedger?.completedCount).toBe(1);
    expect(released.stoppageLedger?.active).toBeUndefined();
  });
});

describe('PR159 dead-ball interval ledger and persisted compatibility', () => {
  it('records overlapping reasons once and preserves timestamps across a save round trip', () => {
    const initial = fixture();
    let state = beginStoppage({ ...initial, time: 100 }, 'foul-99', 'foul', 99, 'award-100');
    state = beginStoppage({ ...state, time: 102 }, 'card-102', 'discipline');
    state = beginStoppage({ ...state, time: 103 }, 'setup-103', 'restart_preparation');
    state = beginStoppage(state, 'setup-103', 'restart_preparation');
    state = markStoppageReady({ ...state, time: 104 }, true, false);
    state = markStoppageReady({ ...state, time: 106 }, true, true);
    expect(elapsedDeadBallSeconds(state)).toBe(6);
    expect(state.stoppageLedger?.active).toMatchObject({
      eventAt: 99,
      startedAt: 100,
      ballReadyAt: 104,
      legalReadyAt: 106,
      reasons: ['foul', 'discipline', 'restart_preparation'],
    });
    const restored = tacticalMatchStateSchema.parse(JSON.parse(JSON.stringify(state)));
    expect(restored.stoppageLedger).toEqual(state.stoppageLedger);
    const completed = endStoppage({ ...state, time: 108 });
    expect(stoppageLedgerSchema.safeParse(completed.stoppageLedger).success).toBe(true);
    expect(completed.stoppageLedger).toMatchObject({
      completedSeconds: 8,
      completedCount: 1,
      intervals: [{ executedAt: 108, endedAt: 108, endReason: 'execution' }],
    });
    expect(endStoppage(completed)).toBe(completed);
  });
  it('accepts older setup/release states without live-origin fields', () => {
    const state = award();
    const { origin: _origin, spot: _spot, awardId: _awardId, ...legacy } = state.restart!;
    void [_origin, _spot, _awardId];
    for (const phase of ['setup', 'release'] as const)
      expect(
        tacticalMatchStateSchema.safeParse({ ...state, restart: { ...legacy, phase } }).success,
      ).toBe(true);
  });
  it('persists signed physical transport offsets instead of treating them as pitch positions', () => {
    const state = physicallyPrepared();
    const transporting: TacticalMatchState = {
      ...state,
      ball: { x: 105.6, y: 34.2 },
      players: state.players.map((player) =>
        player.id === state.restart!.takerId
          ? { ...player, position: { x: 106.2, y: 34 }, target: { x: 106.2, y: 34 } }
          : player,
      ),
      restart: {
        ...state.restart!,
        retrieval: {
          playerId: state.restart!.takerId,
          stage: 'transport',
          attachedOffset: { x: -0.6, y: 0.2 },
        },
      },
    };
    expect(
      tacticalMatchStateSchema.safeParse(JSON.parse(JSON.stringify(transporting))).success,
    ).toBe(true);
  });
  it.each([
    { status: 'first_half', time: 2699.99, result: 'half_time', at: 2700 },
    { status: 'second_half', time: 5399.99, result: 'full_time', at: 5400 },
  ] as const)(
    'closes the active ledger when $status reaches its terminal whistle',
    ({ status, time, result, at }) => {
      const prepared = physicallyPrepared();
      const state: TacticalMatchState = {
        ...prepared,
        status,
        time,
        // This is a newly begun ordinary restart at the boundary, not a 45-minute delay.
        stoppageLedger: {
          ...prepared.stoppageLedger!,
          active: {
            ...prepared.stoppageLedger!.active!,
            startedAt: time,
            eventAt: time,
            period: status,
          },
        },
      };
      const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(next.status).toBe(result);
      expect(next.time).toBe(at);
      expect(next.restart).toBeUndefined();
      expect(next.stoppageLedger?.active).toBeUndefined();
      expect(next.stoppageLedger?.intervals.at(-1)).toMatchObject({
        endReason: 'period_end',
        endedAt: at,
      });
    },
  );
  it('ends one active stoppage when an insufficient roster abandons the match', () => {
    const prepared = physicallyPrepared();
    const home = prepared.players.filter((player) => player.team === 'home').slice(0, 6);
    const insufficient: TacticalMatchState = {
      ...prepared,
      players: prepared.players.filter((player) => player.team !== 'home' || home.includes(player)),
    };
    const next = stepTacticalMatchAfterDecisionProbe(insufficient, FIXED_MATCH_DT);
    expect(next.status).toBe('abandoned');
    expect(next.restart).toBeUndefined();
    expect(next.stoppageLedger?.active).toBeUndefined();
    expect(next.stoppageLedger?.intervals.at(-1)?.endReason).toBe('abandoned');
  });
  it.each(['full_time', 'abandoned'] as const)(
    'prevents queued restart execution after %s',
    (status) => {
      const prepared = physicallyPrepared('free_kick_wide');
      const action = enumerateRestartActions(prepared).find(
        (candidate) => candidate.type === 'pass',
      )!;
      const queued = resolveMatchAction(prepared, action, 'human_selected');
      const terminal: TacticalMatchState = { ...queued, status };
      expect(canExecutePreparedRestart(terminal)).toBe(false);
      expect(resolveMatchAction(terminal, action, 'human_selected')).toBe(terminal);
      expect(stepTacticalMatchAfterDecisionProbe(terminal, FIXED_MATCH_DT)).toBe(terminal);
    },
  );
});

describe('PR159 natural post-goal reaction and retrieval', () => {
  const goalFlight = (urgent: boolean): TacticalMatchState => {
    const initial = fixture(`pr159-goal-${urgent ? 'urgent' : 'ordinary'}`);
    const actor = initial.players.find(
      (player) => player.team === 'home' && player.profile.primaryPosition !== 'goalkeeper',
    )!;
    const open: TacticalMatchState = {
      ...initial,
      time: urgent ? 87 * 60 : 20 * 60,
      status: urgent ? 'second_half' : 'first_half',
      score: urgent ? { home: 0, away: 2 } : { home: 2, away: 0 },
      players: initial.players.map((player, index) => ({
        ...player,
        position: player.id === actor.id ? { x: 99, y: 34 } : { x: 20 + index, y: 60 },
        target: player.id === actor.id ? { x: 99, y: 34 } : { x: 20 + index, y: 60 },
        velocity: { x: 0, y: 0 },
      })),
      ball: { x: 99.3, y: 34, ownerId: actor.id, lastTouchPlayerId: actor.id },
    };
    const shot = resolveMatchAction(open, {
      type: 'shot',
      actorId: actor.id,
      target: { x: 105, y: 34 },
      intent: 'placed',
      goalTarget: { horizontal: 0, vertical: 0.2 },
    });
    expect(shot.ball.shot).toBeDefined();
    // A deterministic finite flight fixture crosses the goal plane in the normal resolver.
    return {
      ...shot,
      ball: {
        ...shot.ball,
        x: 104.9,
        y: 34,
        height: 0.4,
        velocity: { x: 25, y: 0, z: 0 },
        airborne: true,
      },
    };
  };
  it('retrieves the real ball after a late goal while another goal is still needed', () => {
    const initial = goalFlight(true);
    const goal = tickUntil(initial, (state) => state.postGoal !== undefined, 8);
    expect(goal.score).toEqual({ home: 1, away: 2 });
    expect(goal.postGoal).toMatchObject({ urgent: true, scoringTeam: 'home', kickoffTeam: 'away' });
    expect(goal.ball.x).toBeGreaterThan(105);
    const next = stepTacticalMatchAfterDecisionProbe(goal, FIXED_MATCH_DT);
    expect(Math.hypot(next.ball.x - goal.ball.x, next.ball.y - goal.ball.y)).toBeLessThan(1);
    const retrieving = tickUntil(
      goal,
      (state) => state.scenario === 'kick_off' && state.restart?.origin === 'live_event',
      640,
    );
    expect(retrieving.restart?.restartTeam).toBe('away');
    expect(retrieving.restart?.retrieval?.playerId).toBe(goal.postGoal!.retrieverId);
    expect(retrieving.ball.x).toBeGreaterThan(52.5);
  });
  it('allows a less urgent canonical reaction when extending a lead', () => {
    const goal = tickUntil(goalFlight(false), (state) => state.postGoal !== undefined, 8);
    expect(goal.score).toEqual({ home: 3, away: 0 });
    expect(goal.postGoal?.urgent).toBe(false);
    expect(goal.postGoal!.reactionUntil).toBeGreaterThan(goal.time);
    expect(stepTacticalMatchAfterDecisionProbe(goal, FIXED_MATCH_DT).postGoal?.goalId).toBe(
      goal.postGoal!.goalId,
    );
  });
});
