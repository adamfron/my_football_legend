import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createMatchStatistics,
  createTacticalMatch,
  observePlayerMatchStats,
  type TacticalMatchState,
} from '.';

const world = createCanonicalWorldDatabase();
const state = (seed: string) =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

const completedPass = (base: TacticalMatchState, passerId: string, scorerId: string) => ({
  ...base,
  lastPassDiagnostic: {
    passId: 'assist-pass',
    passerId,
    intendedReceiverId: scorerId,
    releasedAt: base.time,
    resolvedAt: base.time + 1,
    receiverPositionAtRelease: { x: 70, y: 34 },
    receiverVelocityAtRelease: { x: 0, y: 0 },
    predictedReceptionPoint: { x: 80, y: 34 },
    actualContactPoint: { x: 80, y: 34 },
    awarenessDelay: 0.1,
    receiverArrivalEstimate: 1,
    bestDefenderArrivalEstimate: 2,
    leadDistance: 0,
    finalResult: 'completed' as const,
  },
});

describe('assist observation', () => {
  it('attributes one assist after normal scorer possession and never double counts the goal', () => {
    const initial = state('assist-once');
    const scorer = initial.players.find(
      (player) => player.team === 'home' && player.id !== initial.ball.ownerId,
    )!;
    const passer = initial.players.find(
      (player) => player.team === scorer.team && player.id !== scorer.id,
    )!;
    const received = completedPass(initial, passer.id, scorer.id);
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const goal = {
      ...received,
      lastShot: {
        shotId: 'assist-goal',
        shooterId: scorer.id,
        context: 'open_play' as const,
        distance: 15,
        angle: 1,
        pressure: 0,
        blockingDefenders: 0,
        baseXg: 0.3,
        effectiveScoringExpectation: 0.3,
        shooterExecutionQuality: 0.8,
        intendedTarget: { horizontal: 0, vertical: 0.3 },
        actualTarget: { horizontal: 0, vertical: 0.3 },
        error: { horizontal: 0, vertical: 0 },
        speed: 24,
        classification: 'on_target' as const,
        outcome: 'goal' as const,
      },
    };
    statistics = observePlayerMatchStats(statistics, received, goal);
    statistics = observePlayerMatchStats(statistics, goal, goal);
    expect(statistics.players.find((entry) => entry.playerId === passer.id)?.assists).toBe(1);
    expect(statistics.observedAssistGoalIds).toEqual(['assist-goal']);
  });

  it('invalidates the provider after controlled opponent possession', () => {
    const initial = state('assist-turnover');
    const home = initial.players.filter((player) => player.team === 'home');
    const away = initial.players.find((player) => player.team === 'away')!;
    const received = completedPass(initial, home[0]!.id, home[1]!.id);
    let statistics = observePlayerMatchStats(createMatchStatistics(initial), initial, received);
    const turnover = {
      ...received,
      ball: { ...received.ball, ownerId: away.id },
      possessionTeam: 'away' as const,
      lastPossessionChange: {
        at: received.time + 1,
        from: 'home' as const,
        to: 'away' as const,
        cause: 'interception' as const,
      },
    };
    statistics = observePlayerMatchStats(statistics, received, turnover);
    expect(statistics.assistCandidate).toBeUndefined();
  });
});
