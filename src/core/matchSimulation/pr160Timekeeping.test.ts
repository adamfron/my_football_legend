// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from './matchSimulation';
import { awardNaturalRestart } from './restartScenarios';
import { legalizeRestartPlayerTarget } from './restartLaws';
import { advanceRestartPlacement } from './restartLifecycle';
import {
  preparePeriodEnd,
  periodCanEnd,
  qualifyingLostTime,
  resetSecondHalfTimekeeping,
} from './matchTimekeeping';
import { beginStoppage, endStoppage } from './stoppageLedger';
import { processInjuryAssessment } from './injuryStoppage';
import type { TacticalMatchState } from './matchState';
const world = createCanonicalWorldDatabase();
const fixture = (): TacticalMatchState => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr160-clock',
      control: { mode: 'spectator' },
    }),
  );
  const { restart: _restart, ...open } = initial;
  void _restart;
  return { ...open, scenario: 'open_play', playerAgencyEnabled: false, actionCooldown: 99999 };
};
const interval = (
  state: TacticalMatchState,
  reason: Parameters<typeof beginStoppage>[2],
  start: number,
  end: number,
) =>
  endStoppage({
    ...beginStoppage({ ...state, time: start }, `${reason}-${start}`, reason),
    time: end,
  });
const terminalPrepared = (period: 'first_half' | 'second_half', at: number) => {
  const initial = awardNaturalRestart({ ...fixture(), status: period, time: at }, 'penalty', {
    restartTeam: 'home',
    incidentId: 'terminal-penalty',
    incidentPoint: { x: 94, y: 34 },
    cause: 'foul',
  });
  return advanceRestartPlacement(
    {
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
    },
    0,
  );
};
const launch = (state: TacticalMatchState) => {
  let next = state;
  for (let i = 0; i < 100 && !next.ball.shot; i++)
    next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
  expect(next.ball.shot?.context).toBe('penalty');
  return next;
};
const movingKeeperDeflection = (
  state: TacticalMatchState,
  goalkeeperAction: 'parry' | 'failed_save' = 'parry',
): TacticalMatchState => {
  const shot = state.ball.shot!;
  const keeperId = state.timekeeping!.terminalPenalty!.keeperId!;
  return preparePeriodEnd({
    ...state,
    scenario: 'open_play',
    lastShot: {
      ...shot,
      keeperId,
      goalkeeperAction,
      outcome: goalkeeperAction === 'failed_save' ? 'block' : 'save',
    },
    lastShotResult: goalkeeperAction === 'failed_save' ? 'block' : 'save',
    pendingPossessionLoss: {
      id: `${state.seed}:shot-rebound:${shot.shotId}`,
      at: state.time,
      team: 'home',
      actorId: shot.shooterId,
      cause: 'shot',
    },
    lastBallContact: {
      kind: 'goalkeeper',
      playerId: keeperId,
      at: state.time,
      segmentFraction: 1,
      point: { x: 104, y: 36, z: 0.11 },
      preContactSpeed: 20,
      postContactSpeed: 8,
    },
    ball: {
      x: 104,
      y: 36,
      height: 0.11,
      velocity: { x: 8, y: 0, z: 0 },
      looseSince: state.time,
      lastTouchPlayerId: keeperId,
    },
  });
};
describe('PR160 canonical qualifying lost time', () => {
  it('does not add time for an ordinary short restart or uninterrupted play', () => {
    const short = interval(fixture(), 'throw_in', 100, 110);
    expect(qualifyingLostTime(short)).toBe(0);
    expect(preparePeriodEnd({ ...short, time: 2700 }).timekeeping).toMatchObject({
      minimumAnnouncedAddedSeconds: 0,
      requiredEndAt: 2700,
    });
    expect(periodCanEnd(preparePeriodEnd({ ...fixture(), time: 2700 }))).toBe(true);
  });
  it.each(['goal', 'substitution', 'injury', 'discipline'] as const)(
    'qualifies actual %s delay',
    (reason) => {
      const state = interval(fixture(), reason, 100, 125);
      expect(qualifyingLostTime(state)).toBe(25);
      expect(
        preparePeriodEnd({ ...state, time: 2700 }).timekeeping?.minimumAnnouncedAddedSeconds,
      ).toBe(60);
    },
  );
  it('counts abnormal restart delay and overlapping reasons once, respecting reason onset', () => {
    let state = beginStoppage({ ...fixture(), time: 100 }, 'throw', 'throw_in');
    state = beginStoppage({ ...state, time: 115 }, 'injury', 'injury');
    state = beginStoppage({ ...state, time: 120 }, 'substitution', 'substitution');
    state = endStoppage({ ...state, time: 140 });
    expect(qualifyingLostTime(state)).toBe(25);
    expect(state.stoppageLedger?.completedSeconds).toBe(40);
    expect(state.stoppageLedger?.completedCount).toBe(1);
    expect(endStoppage(state)).toBe(state);
    expect(qualifyingLostTime(interval(fixture(), 'goal_kick', 100, 145))).toBe(15);
  });
  it('keeps announced minimum immutable and extends only for further qualifying added-time loss', () => {
    const state = interval(fixture(), 'goal', 100, 125);
    let announced = preparePeriodEnd({ ...state, time: 2700 });
    expect(announced.timekeeping?.minimumAnnouncedAddedSeconds).toBe(60);
    announced = preparePeriodEnd(interval(announced, 'injury', 2720, 2732));
    expect(announced.timekeeping).toMatchObject({
      minimumAnnouncedAddedSeconds: 60,
      additionalLostAfterAnnouncement: 12,
      requiredEndAt: 2772,
    });
    const running = preparePeriodEnd({ ...announced, time: 2770 });
    expect(running.timekeeping?.requiredEndAt).toBe(2772);
    expect(running.periodEndPending).toBe(false);
    expect(periodCanEnd(preparePeriodEnd({ ...running, time: 2772 }))).toBe(true);
  });
  it('does not lose aggregate qualified time when bounded interval retention discards old records', () => {
    let state = fixture();
    for (let i = 0; i < 520; i++) state = interval(state, 'injury', i * 2, i * 2 + 1);
    expect(state.stoppageLedger?.intervals).toHaveLength(512);
    expect(qualifyingLostTime(state)).toBe(520);
  });
  it('gives the second half its own full duration and own allowance after first-half added time', () => {
    const first = interval(fixture(), 'goal', 100, 125);
    const second = startSecondHalf({
      ...preparePeriodEnd({ ...first, time: 2760 }),
      status: 'half_time',
    });
    expect(second.status).toBe('second_half');
    expect(second.timekeeping).toMatchObject({
      periodStartedAt: 2760,
      nominalEndAt: 5460,
      qualifyingLostSeconds: 0,
    });
    expect(second.restart?.restartTeam).toBe('away');
    expect(
      qualifyingLostTime(
        resetSecondHalfTimekeeping({ ...first, status: 'second_half', time: 2760 }),
      ),
    ).toBe(0);
  });
});
describe('PR160 terminal penalty and period decisions', () => {
  it.each([
    { period: 'first_half', at: 2699.99, end: 'half_time' },
    { period: 'second_half', at: 5399.99, end: 'full_time' },
  ] as const)(
    'completes a scored terminal penalty in $period without creating kickoff',
    ({ period, at, end }) => {
      const initial = terminalPrepared(period, at);
      const released = launch(initial);
      expect(released.periodEndPending).toBe(true);
      expect(released.status).toBe(period);
      let state: TacticalMatchState = {
        ...released,
        ball: {
          ...released.ball,
          x: 104.99,
          y: 36,
          height: 2,
          velocity: { x: 20, y: 0, z: 0 },
          airborne: true,
        },
      };
      for (let i = 0; i < 8 && state.status === period; i++)
        state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
      expect(state.lastShotResult).toBe('goal');
      expect(state.score.home).toBe(1);
      expect(state.status).toBe(end);
      expect(state.restart).toBeUndefined();
      expect(state.postGoal).toBeUndefined();
      expect(state.timekeeping?.terminalPenalty?.completedAt).toBeDefined();
    },
  );
  it('waits for a physically unready terminal penalty instead of cancelling or executing it', () => {
    const state = awardNaturalRestart({ ...fixture(), time: 2699.99 }, 'penalty', {
      restartTeam: 'away',
      incidentId: 'unready-terminal',
      incidentPoint: { x: 11, y: 34 },
    });
    const next = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    expect(next.status).toBe('first_half');
    expect(next.time).toBeGreaterThan(2700);
    expect(next.timekeeping?.terminalPenalty).toBeDefined();
    expect(next.restart?.selectedAction).toBeUndefined();
    expect(next.periodEndPending).toBe(false);
  });
  it('completes a terminal miss at the actual boundary and a caught save when the ball is held', () => {
    const released = launch(terminalPrepared('first_half', 2699.99));
    const shot = released.ball.shot!;
    const miss = preparePeriodEnd({
      ...released,
      lastShot: { ...shot, outcome: 'miss' },
      ball: { x: 105.5, y: 40 },
      scenario: 'open_play',
    });
    expect(periodCanEnd(miss)).toBe(true);
    const save = preparePeriodEnd({
      ...released,
      lastShot: { ...shot, outcome: 'save', goalkeeperAction: 'catch' },
      ball: { x: 105, y: 34, ownerId: released.timekeeping!.terminalPenalty!.keeperId! },
    });
    expect(periodCanEnd(save)).toBe(true);
    const parry = preparePeriodEnd({
      ...released,
      lastShot: { ...shot, outcome: 'save', goalkeeperAction: 'parry' },
      ball: { x: 104, y: 34, velocity: { x: -8, y: 0, z: 0 }, height: 0.1 },
    });
    expect(periodCanEnd(parry)).toBe(false);
  });
  it('keeps a moving keeper failed-save block live but ends on a subsequent nonkeeper contact', () => {
    const released = launch(terminalPrepared('first_half', 2699.99));
    const keeperBlocked = movingKeeperDeflection(released, 'failed_save');
    expect(keeperBlocked.lastShot?.outcome).toBe('block');
    expect(periodCanEnd(keeperBlocked)).toBe(false);
    expect(keeperBlocked.timekeeping?.terminalPenalty?.completedAt).toBeUndefined();
    const defender = keeperBlocked.players.find(
      (p) => p.team === 'away' && p.id !== keeperBlocked.timekeeping!.terminalPenalty!.keeperId,
    )!;
    const defenderBlocked = preparePeriodEnd({
      ...keeperBlocked,
      time: keeperBlocked.time + FIXED_MATCH_DT,
      lastBallContact: {
        ...keeperBlocked.lastBallContact!,
        kind: 'defender',
        playerId: defender.id,
        at: keeperBlocked.time + FIXED_MATCH_DT,
      },
      ball: { ...keeperBlocked.ball, lastTouchPlayerId: defender.id },
    });
    expect(periodCanEnd(defenderBlocked)).toBe(true);
    expect(defenderBlocked.timekeeping?.terminalPenalty?.completedAt).toBeDefined();
  });
  it('removes an injured body after a terminal parry while preserving its rebound through genuine completion', () => {
    const released = launch(terminalPrepared('first_half', 2699.99));
    const parry = movingKeeperDeflection(released);
    const actor = parry.players.find(
      (p) =>
        p.id !== parry.timekeeping!.terminalPenalty!.keeperId &&
        p.id !== released.ball.shot!.shooterId,
    )!;
    const injury = {
      id: 'pr160-terminal-parry-injury',
      playerId: actor.id,
      at: parry.time,
      status: 'unable' as const,
      mechanism: 'contact' as const,
      injuryType: 'impact' as const,
      recoveryDays: 2,
      assessmentRequired: true,
    };
    const injured: TacticalMatchState = {
      ...parry,
      pendingInjuryAssessment: injury.id,
      injuries: [injury],
      players: parry.players.map((p) => (p.id === actor.id ? { ...p, injury } : p)),
    };
    const removed = processInjuryAssessment(injured);
    expect(removed.players.some((p) => p.id === actor.id)).toBe(false);
    expect(removed.departedPlayers?.some((p) => p.id === actor.id)).toBe(true);
    expect(removed.injuryAssessment).toBeUndefined();
    expect(removed.ball).toEqual(injured.ball);
    expect(periodCanEnd(removed)).toBe(false);
    let next = stepTacticalMatchAfterDecisionProbe(removed, FIXED_MATCH_DT);
    expect(next.injuryAssessment).toBeUndefined();
    expect(next.ball.x).toBeGreaterThan(removed.ball.x);
    expect(next.status).toBe('first_half');
    for (let i = 0; i < 30 && next.status === 'first_half'; i++)
      next = stepTacticalMatchAfterDecisionProbe(next, FIXED_MATCH_DT);
    expect(next.lastShot?.outcome).toBe('goal');
    expect(next.score.home).toBe(1);
    expect(next.status).toBe('half_time');
    expect(next.timekeeping?.terminalPenalty?.completedAt).toBeDefined();
    expect(next.restart).toBeUndefined();
  });
  it('extends a retake and ignores the preceding completed kick', () => {
    const released = launch(terminalPrepared('second_half', 5399.99));
    const retake = awardNaturalRestart({ ...released, time: released.time + 0.5 }, 'penalty', {
      restartTeam: 'home',
      incidentId: 'terminal-retake',
      incidentPoint: { x: 94, y: 34 },
    });
    const state = preparePeriodEnd(retake);
    expect(state.periodEndPending).toBe(false);
    expect(periodCanEnd(state)).toBe(false);
    expect(state.timekeeping?.terminalPenalty?.awardId).toBe(retake.restart?.awardId);
    expect(state.timekeeping?.terminalPenalty?.shotId).toBeUndefined();
  });
  it('finishes an already released shot but gives no automatic extension to an unreleased attack', () => {
    const state = preparePeriodEnd({ ...fixture(), time: 2700 });
    expect(periodCanEnd({ ...state, ball: { ...state.ball, travelKind: 'shot' } })).toBe(false);
    expect(periodCanEnd(state)).toBe(true);
    expect(preparePeriodEnd({ ...state, status: 'abandoned' }).status).toBe('abandoned');
  });
});
