// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
  stepTacticalMatch,
} from './matchSimulation';
import { awardNaturalRestart } from './restartScenarios';
import {
  legalizeRestartPlayerTarget,
  deriveRestartLegalReadiness,
  restartPenaltyGoalkeeper,
} from './restartLaws';
import {
  advanceRestartPlacement,
  canExecutePreparedRestart,
  prepareRestartMovement,
} from './restartLifecycle';
import { observeRestartLiveness } from './restartLiveness';
import { projectPlayerDecisionOpportunity } from './playerDecision';
import type { TacticalMatchState } from './matchState';
import { tacticalMatchStateSchema } from './matchState';
const world = createCanonicalWorldDatabase();
const fixture = (seed = 'lab-mv1fg3zw', homeClubIndex = 0): TacticalMatchState => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[homeClubIndex]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
  const { restart: _restart, ...open } = initial;
  void _restart;
  return { ...open, scenario: 'open_play', playerAgencyEnabled: false };
};
const penalty = (side: 'home' | 'away', at = 415, homeClubIndex = 0) =>
  awardNaturalRestart(
    {
      ...fixture('lab-mv1fg3zw', homeClubIndex),
      time: at,
      ball: { x: side === 'away' ? 11.05 : 93.95, y: 34.037, velocity: { x: 0, y: 0 } },
    },
    'penalty',
    {
      restartTeam: side,
      incidentId: `pr160-penalty-${side}-${at}`,
      incidentPoint: { x: side === 'away' ? 11 : 94, y: 34 },
      cause: 'foul',
    },
  );
const executionAt = (state: TacticalMatchState, incidentId: string) =>
  state.stoppageLedger?.intervals.find(
    (p) => p.incidentId === incidentId && p.endReason === 'execution',
  )?.executedAt;
const until = (
  initial: TacticalMatchState,
  predicate: (state: TacticalMatchState) => boolean,
  ticks = 2400,
) => {
  let state = initial;
  for (let i = 0; i < ticks && !predicate(state); i++)
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  return state;
};
const prepared = (at = 415, side: 'home' | 'away' = 'away', homeClubIndex = 0) => {
  const initial = penalty(side, at, homeClubIndex);
  const state: TacticalMatchState = {
    ...initial,
    ball: { ...initial.restart!.spot!, velocity: { x: 0, y: 0, z: 0 }, height: 0 },
    restart: {
      ...initial.restart!,
      retrieval: { playerId: initial.restart!.takerId, stage: 'placed' },
    },
    players: initial.players.map((p) => ({
      ...p,
      position: legalizeRestartPlayerTarget(
        initial,
        p,
        initial.restart!.targets[p.id] ?? p.position,
      ),
      velocity: { x: 0, y: 0 },
    })),
  };
  return advanceRestartPlacement(state, 0);
};
describe('PR160 penalty liveness regression', () => {
  it('reconstructs the original lab-mv1fg3zw blocked participant with its real club and XI', () => {
    // The authentic export's telemetry reconstructs clubs[9]/clubs[1] and these 22 identities.
    // Baseline replay matches pre-penalty ball samples within 1e-9 m and blocks at 415.125 s.
    const initial = prepared(600, 'away', 9);
    expect(initial.players.map((p) => p.id)).toEqual([
      ...[0, 7, 3, 5, 9, 14, 13, 11, 17, 19, 22].map((n) => `footballer_pro_9_${n}`),
      ...[0, 7, 3, 4, 9, 12, 14, 17, 19, 21, 22].map((n) => `footballer_pro_1_${n}`),
    ]);
    const actorId = 'footballer_pro_1_12';
    const position = { x: 16.48731140893103, y: 47.0150416543275 };
    const target = { x: 16.503302916222147, y: 47.082018990216795 };
    const blocked: TacticalMatchState = {
      ...initial,
      ball: {
        x: 11.050017293263995,
        y: 34.037071252246704,
        height: 0.0999999999999995,
        velocity: { x: 0, y: 0, z: 0 },
      },
      players: initial.players.map((p) =>
        p.id === actorId ? { ...p, position, target, velocity: { x: 0, y: 0 } } : p,
      ),
      restart: {
        ...initial.restart!,
        retrieval: {
          playerId: actorId,
          stage: 'placed',
          attachedOffset: { x: 0.42399028542814143, y: 0.053255838736077976 },
        },
        targets: { ...initial.restart!.targets, [actorId]: target },
        roles: {
          ...initial.restart!.roles,
          [actorId]: {
            key: 'rebound_attack',
            intent: 'attack_second_ball',
            zone: { centre: { x: 17.200000000000003, y: 50 }, radius: 8, timing: 0 },
          },
        },
      },
    };
    expect(Math.hypot(position.x - target.x, position.y - target.y)).toBeLessThan(0.08);
    expect(deriveRestartLegalReadiness(blocked)).toMatchObject({
      ballReady: true,
      takerReady: true,
      opponentsReady: true,
      participantsReady: false,
      blockers: ['participant_restriction'],
    });
    expect(blocked.restart?.selectedAction).toBeUndefined();
    const released = until(
      blocked,
      (s) => executionAt(s, initial.lastRestartAward!.incidentId!) !== undefined,
      160,
    );
    expect(executionAt(released, initial.lastRestartAward!.incidentId!)).toBeGreaterThan(600);
    expect(released.latestActionSource).toBe('autonomous_npc');
    expect(released.ball.shot?.context).toBe('penalty');
  });
  it.each(['home', 'away'] as const)(
    'moves a participant clear of the penalty-area boundary despite the locomotion arrival radius for %s',
    (side) => {
      const initial = prepared(415, side);
      const participant = initial.players.find(
        (p) => p.team !== side && p.id !== restartPenaltyGoalkeeper(initial)?.id,
      )!;
      const mirror = (x: number) => (side === 'away' ? x : 105 - x);
      const position = { x: mirror(16.464133), y: 45.660148 };
      const target = { x: mirror(16.508762), y: 45.712732 };
      const state: TacticalMatchState = {
        ...initial,
        players: initial.players.map((p) =>
          p.id === participant.id ? { ...p, position, target, velocity: { x: 0, y: 0 } } : p,
        ),
        restart: {
          ...initial.restart!,
          targets: { ...initial.restart!.targets, [participant.id]: target },
          roles: {
            ...initial.restart!.roles,
            [participant.id]: {
              ...initial.restart!.roles[participant.id]!,
              zone: { ...initial.restart!.roles[participant.id]!.zone, centre: target, radius: 0 },
            },
          },
        },
      };
      expect(deriveRestartLegalReadiness(state).participantsReady).toBe(false);
      expect(legalizeRestartPlayerTarget(state, participant, target).x).toBe(mirror(16.8));
      const released = until(
        state,
        (s) => executionAt(s, initial.lastRestartAward!.incidentId!) !== undefined,
      );
      expect(executionAt(released, initial.lastRestartAward!.incidentId!)).toBeDefined();
      expect(released.lastRestartLivenessRecovery).toBeUndefined();
    },
  );
  it('executes a CPU penalty after the preferred goalkeeper becomes unavailable, preserving actual profiles', () => {
    const initial = fixture();
    const keeper = initial.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    const awarded = awardNaturalRestart(
      {
        ...initial,
        time: 415,
        players: initial.players.filter((p) => p.id !== keeper.id),
        ball: { x: 11.05, y: 34.037, velocity: { x: 0, y: 0 } },
      },
      'penalty',
      {
        restartTeam: 'away',
        incidentId: 'pr160-dismissed-keeper',
        incidentPoint: { x: 11, y: 34 },
      },
    );
    const nominated = restartPenaltyGoalkeeper(awarded)!;
    expect(nominated.profile.primaryPosition).not.toBe('goalkeeper');
    expect(nominated.goalkeeperRole).toBe(true);
    expect(awarded.players.filter((p) => p.team === 'home' && p.goalkeeperRole)).toHaveLength(1);
    expect(awarded.restart?.roles[nominated.id]?.key).toBe('penalty_goalkeeper');
    const state = until(awarded, (s) => executionAt(s, 'pr160-dismissed-keeper') !== undefined);
    expect(executionAt(state, 'pr160-dismissed-keeper')).toBeGreaterThan(415);
    expect(state.players.find((p) => p.id === nominated.id)?.profile).toEqual(nominated.profile);
    expect(state.lastRestartLivenessRecovery).toBeUndefined();
  });
  it.each(['home', 'away'] as const)(
    'physically prepares and executes an ordinary CPU penalty for %s',
    (side) => {
      const initial = penalty(side);
      const id = initial.lastRestartAward!.incidentId!;
      const state = until(initial, (s) => executionAt(s, id) !== undefined);
      expect(executionAt(state, id)).toBeDefined();
      expect(state.decisionIndex).toBeGreaterThan(initial.decisionIndex);
      expect(state.ball.shot?.context).toBe('penalty');
      expect(state.latestActionSource).toBe('autonomous_npc');
      expect(
        state.restartLivenessDiagnostics?.some((d) => d.classification === 'soft_lock') ?? false,
      ).toBe(false);
    },
  );
  it.each(['home', 'away'] as const)(
    'lets the %s goalkeeper physically retrieve a scored ball beyond the goal line for kickoff',
    (side) => {
      const open = fixture(`pr160-scored-ball-${side}`);
      const keeper = open.players.find(
        (p) => p.team === side && p.profile.primaryPosition === 'goalkeeper',
      )!;
      const mirror = (x: number) => (side === 'home' ? x : 105 - x);
      const ball = { x: mirror(-1.1597539281079288), y: 31.042615624941835 };
      const awarded = awardNaturalRestart(
        {
          ...open,
          time: 435,
          ball: { ...ball, height: 0.11, velocity: { x: 0, y: 0, z: 0 } },
          players: open.players.map((p) =>
            p.id === keeper.id
              ? { ...p, position: { x: mirror(0), y: ball.y }, velocity: { x: 0, y: 0 } }
              : p,
          ),
        },
        'kick_off',
        { restartTeam: side, cause: 'goal', incidentId: `pr160-scored-ball-${side}` },
      );
      const preparedMovement = prepareRestartMovement(awarded);
      expect(preparedMovement.restart?.retrieval?.playerId).toBe(keeper.id);
      expect(preparedMovement.players.find((p) => p.id === keeper.id)?.target).toEqual(ball);
      const first = stepTacticalMatchAfterDecisionProbe(preparedMovement, FIXED_MATCH_DT);
      expect(first.ball.x).toBe(ball.x);
      expect(first.ball.y).toBe(ball.y);
      const carrying = until(first, (s) => s.restart?.retrieval?.stage === 'transport', 100);
      expect(carrying.restart?.retrieval?.stage).toBe('transport');
      expect(mirror(carrying.players.find((p) => p.id === keeper.id)!.position.x)).toBeLessThan(0);
      const released = until(
        carrying,
        (s) => executionAt(s, `pr160-scored-ball-${side}`) !== undefined,
      );
      expect(executionAt(released, `pr160-scored-ball-${side}`)).toBeDefined();
      expect(released.latestActionSource).toBe('autonomous_npc');
      expect(released.lastRestartLivenessRecovery).toBeUndefined();
    },
  );
  it('clears initially illegal participants and waits for a far taker through locomotion', () => {
    const awarded = penalty('away');
    const takerId = awarded.restart!.takerId;
    const initial: TacticalMatchState = {
      ...awarded,
      players: awarded.players.map((p, i) => ({
        ...p,
        position: p.id === takerId ? { x: 102, y: 62 } : { x: 8 + i * 0.7, y: 25 + i * 0.65 },
        velocity: { x: 0, y: 0 },
      })),
    };
    expect(deriveRestartLegalReadiness(initial).ready).toBe(false);
    const next = stepTacticalMatchAfterDecisionProbe(initial, FIXED_MATCH_DT);
    const taker = next.players.find((p) => p.id === takerId)!;
    expect(Math.hypot(taker.position.x - 102, taker.position.y - 62)).toBeLessThan(0.2);
    const state = until(
      next,
      (s) => executionAt(s, initial.lastRestartAward!.incidentId!) !== undefined,
      4800,
    );
    expect(executionAt(state, initial.lastRestartAward!.incidentId!)).toBeDefined();
  });
  it('reassigns an unavailable taker and executes the same award', () => {
    const initial = penalty('away');
    const takerId = initial.restart!.takerId;
    const replaced = { ...initial, players: initial.players.filter((p) => p.id !== takerId) };
    const state = until(
      replaced,
      (s) => executionAt(s, initial.lastRestartAward!.incidentId!) !== undefined,
    );
    expect(executionAt(state, initial.lastRestartAward!.incidentId!)).toBeDefined();
    expect(state.lastRestartAward?.takerId).not.toBe(takerId);
    expect(state.lastRestartAward?.id).toBe(initial.lastRestartAward?.id);
  });
  it('protects a legal human-owned penalty choice at the terminal boundary', () => {
    const legal = prepared(2699.99);
    const human = {
      ...legal,
      controlledFootballerId: legal.restart!.takerId,
      playerAgencyEnabled: true,
    };
    expect(canExecutePreparedRestart(human)).toBe(false);
    for (const step of [stepTacticalMatch, stepTacticalMatchAfterDecisionProbe]) {
      const next = step(human, FIXED_MATCH_DT);
      expect(next.time).toBe(human.time);
      expect(next.decisionIndex).toBe(human.decisionIndex);
      expect(next.restart?.selectedAction).toBeUndefined();
      expect(next.status).toBe('first_half');
      expect(projectPlayerDecisionOpportunity(next)?.kind).toBe('restart');
    }
  });
  it('observes unchanged blockers with exact actors without manufacturing a restart, and bounds diagnostics', () => {
    let state = prepared();
    const keeper = restartPenaltyGoalkeeper(state)!;
    state = {
      ...state,
      restart: {
        ...state.restart!,
        readiness: {
          ballReady: true,
          takerReady: true,
          legalReady: false,
          tacticalReady: true,
          blockers: ['opponent_restriction'],
        },
      },
      players: state.players.map((p) =>
        p.id === keeper.id ? { ...p, position: { x: 22, y: 34 } } : p,
      ),
    };
    const original = state;
    for (let i = 0; i < 1100; i++) state = observeRestartLiveness({ ...state, time: 415 + i });
    expect(state.restartLivenessDiagnostics).toHaveLength(32);
    const diagnostic = state.restartLivenessDiagnostics!.at(-1)!;
    expect(diagnostic).toMatchObject({
      classification: 'soft_lock',
      blockers: ['opponent_restriction'],
      retrievalStage: 'placed',
      keeperId: keeper.id,
    });
    expect(diagnostic.actors.find((p) => p.id === keeper.id)).toMatchObject({
      position: { x: 22, y: 34 },
      legalTarget: { x: 0, y: 34 },
    });
    expect(state.ball).toEqual(original.ball);
    expect(state.players).toEqual(original.players);
    expect(state.restart).toEqual(original.restart);
    expect(state.decisionIndex).toBe(original.decisionIndex);
    expect(state.stoppageLedger).toEqual(original.stoppageLedger);
    expect(state.statistics).toEqual(original.statistics);
    expect(tacticalMatchStateSchema.safeParse(JSON.parse(JSON.stringify(state))).success).toBe(
      true,
    );
  });
  it('distinguishes human input from a CPU soft lock', () => {
    const initial = prepared();
    let state: TacticalMatchState = {
      ...initial,
      controlledFootballerId: initial.restart!.takerId,
      playerAgencyEnabled: true,
    };
    for (let i = 0; i < 40; i++) state = observeRestartLiveness({ ...state, time: 415 + i });
    expect(state.restartLivenessDiagnostics?.at(-1)?.classification).toBe('pending_human_decision');
  });
  it('keeps an unplaced ball as a physical blocker for a human taker with legal participants', () => {
    const initial = prepared();
    let state: TacticalMatchState = {
      ...initial,
      ball: { x: 13, y: 34, velocity: { x: 0, y: 0, z: 0 }, height: 0 },
      controlledFootballerId: initial.restart!.takerId,
      playerAgencyEnabled: true,
      restart: {
        ...initial.restart!,
        phase: 'setup',
        readiness: {
          ballReady: false,
          takerReady: true,
          legalReady: true,
          tacticalReady: true,
          blockers: ['ball_not_placed'],
        },
      },
    };
    expect(deriveRestartLegalReadiness(state)).toMatchObject({
      ready: false,
      opponentsReady: true,
      participantsReady: true,
      blockers: ['ball_not_placed'],
    });
    for (let i = 0; i < 40; i++) state = observeRestartLiveness({ ...state, time: 415 + i });
    expect(state.restartLivenessDiagnostics?.at(-1)).toMatchObject({
      classification: 'soft_lock',
      blockers: ['ball_not_placed'],
    });
    expect(state.restart?.selectedAction).toBeUndefined();
  });
  it('completes a whole CPU half with a penalty and meaningful canonical progress', () => {
    let state = { ...fixture('pr160-full-half-penalty'), actionCooldown: 0 };
    let awarded = false;
    let penaltyExecution: number | undefined;
    let lastProgressAt = 0;
    let lastDecision = state.decisionIndex;
    for (let i = 0; i < 140000 && state.status === 'first_half'; i++) {
      if (!awarded && state.time >= 415) {
        state = awardNaturalRestart(state, 'penalty', {
          restartTeam: 'away',
          incidentId: 'pr160-full-half-penalty',
          incidentPoint: { x: 11, y: 34 },
          cause: 'foul',
        });
        awarded = true;
      }
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      penaltyExecution ??= executionAt(state, 'pr160-full-half-penalty');
      if (state.decisionIndex !== lastDecision) {
        lastProgressAt = state.time;
        lastDecision = state.decisionIndex;
      }
      if (state.time - lastProgressAt > 180)
        throw new Error(
          `No canonical football/restart action for ${state.time - lastProgressAt}s; ${JSON.stringify(state.restart?.readiness)}`,
        );
      const locks =
        state.restartLivenessDiagnostics?.filter(
          (d) => d.classification === 'soft_lock' && d.unchangedSeconds >= 120,
        ) ?? [];
      if (locks.length) throw new Error(`Restart soft lock: ${JSON.stringify(locks.at(-1))}`);
    }
    expect(awarded).toBe(true);
    expect(penaltyExecution).toBeDefined();
    expect(state.status).toBe('half_time');
    expect(state.time).toBeGreaterThanOrEqual(2700);
    expect(state.restart).toBeUndefined();
    expect(state.timekeeping?.endedAt).toBe(state.time);
    expect(state.decisionIndex).toBeGreaterThan(20);
  }, 90000);
});
