// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { applyRestartScenario } from './restartScenarios';
import { awardOffsideRestart, captureOffsideSnapshot } from './offside';
import {
  deriveRestartLegalReadiness,
  legalizeRestartPlayerTarget,
  legalRestartPosition,
  RESTART_LAWS_VERSION,
  restartLawContract,
  restartLegalReadinessSchema,
  resolveRestartGoalOutcome,
} from './restartLaws';
import type { RestartScenario, TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';

const world = createCanonicalWorldDatabase();
const fixture = (
  scenario: RestartScenario = 'free_kick_close',
  team: TeamSide = 'home',
): TacticalMatchState => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: `pr159-law-${scenario}-${team}`,
      control: { mode: 'spectator' },
    }),
  );
  const injected = applyRestartScenario(initial, scenario, { restartTeam: team });
  const spot = legalRestartPosition(scenario, team, injected.ball);
  const state: TacticalMatchState = {
    ...injected,
    ball: { ...spot, velocity: { x: 0, y: 0, z: 0 } },
    restart: {
      ...injected.restart!,
      phase: 'preparing',
      origin: 'live_event',
      spot,
      ceremonial: true,
    },
  };
  return {
    ...state,
    players: state.players.map((player) => ({
      ...player,
      position: legalizeRestartPlayerTarget(state, player, player.position),
      velocity: { x: 0, y: 0 },
    })),
  };
};

describe('PR159 IFAB 2026/27 restart location and legal contracts', () => {
  it('pins the implemented rule reference', () =>
    expect(RESTART_LAWS_VERSION).toBe('IFAB_2026_27'));
  it('preserves the foul point except for the attacking indirect goal-area exception', () => {
    expect(legalRestartPosition('free_kick_close', 'home', { x: 101, y: 34 }, true)).toEqual({
      x: 99.5,
      y: 34,
    });
    expect(legalRestartPosition('free_kick_close', 'away', { x: 3, y: 31 }, true)).toEqual({
      x: 5.5,
      y: 31,
    });
    expect(legalRestartPosition('free_kick', 'home', { x: 3, y: 31 }, true)).toEqual({
      x: 3,
      y: 31,
    });
    expect(legalRestartPosition('free_kick_wide', 'home', { x: 76.34, y: 2.71 })).toEqual({
      x: 76.34,
      y: 2.71,
    });
  });
  it('uses the actual boundary point for a throw-in and legal areas for goal/corner kicks', () => {
    expect(legalRestartPosition('throw_in', 'away', { x: 68.75, y: 68 })).toEqual({
      x: 68.75,
      y: 68,
    });
    expect(legalRestartPosition('goal_kick', 'away', { x: 105, y: 6 })).toEqual({
      x: 105,
      y: 24.84,
    });
    expect(legalRestartPosition('gk_short', 'home', { x: 7, y: 28 })).toEqual({ x: 5.5, y: 28 });
    expect(legalRestartPosition('corner', 'away', { x: 0, y: 66 })).toEqual({ x: 0.5, y: 67.5 });
    expect(legalRestartPosition('kick_off', 'away', { x: 103, y: 34 })).toEqual({ x: 52.5, y: 34 });
    expect(legalRestartPosition('penalty', 'away', { x: 7, y: 34 })).toEqual({ x: 11, y: 34 });
  });
  it.each(['free_kick_wide', 'corner', 'goal_kick', 'gk_short', 'kick_off', 'penalty'] as const)(
    'permits a direct opponent goal from %s',
    (scenario) => {
      expect(restartLawContract(scenario).directOpponentGoal).toBe(true);
      expect(resolveRestartGoalOutcome(scenario, 'home', 'home')).toBe('goal');
      expect(resolveRestartGoalOutcome(scenario, 'home', 'away')).toBe('corner');
    },
  );
  it('requires another physical player touch for indirect kicks and throw-ins', () => {
    expect(resolveRestartGoalOutcome('free_kick_wide', 'home', 'home', true)).toBe('goal_kick');
    expect(resolveRestartGoalOutcome('free_kick_wide', 'home', 'home', true, true)).toBe('goal');
    expect(resolveRestartGoalOutcome('throw_in', 'away', 'away')).toBe('goal_kick');
    expect(resolveRestartGoalOutcome('throw_in', 'away', 'away', false, false, true)).toBe(
      'indirect_free_kick',
    );
  });
  it('exempts only the three direct-reception restart types from offside', () => {
    for (const scenario of ['corner', 'goal_kick', 'gk_short', 'throw_in'] as const)
      expect(restartLawContract(scenario).offsideExempt).toBe(true);
    expect(restartLawContract('free_kick_wide').offsideExempt).toBe(false);
    expect(restartLawContract('free_kick_close', true).offsideExempt).toBe(false);
  });
});

describe('PR159 restart legal readiness observes real positions', () => {
  it.each([
    'free_kick_close',
    'corner',
    'goal_kick',
    'gk_short',
    'penalty',
    'kick_off',
    'throw_in',
  ] as const)(
    'accepts legal physical readiness for %s without ideal-position equality',
    (scenario) => {
      const state = fixture(scenario);
      const ready = deriveRestartLegalReadiness(state);
      expect(restartLegalReadinessSchema.safeParse(ready).success).toBe(true);
      expect(ready.blockers).toEqual([]);
      expect(ready.ready).toBe(true);
      expect(
        deriveRestartLegalReadiness({
          ...state,
          players: state.players.map((player) => ({ ...player, idealTarget: { x: 52.5, y: 34 } })),
        }),
      ).toEqual(ready);
    },
  );
  it('waits for placement, deceleration and taker reach instead of elapsed delay', () => {
    const ready = fixture();
    expect(deriveRestartLegalReadiness({ ...ready, time: 0 }).ready).toBe(true);
    expect(
      deriveRestartLegalReadiness({
        ...ready,
        time: 300,
        ball: { ...ready.ball, x: ready.ball.x - 2 },
      }).ballReady,
    ).toBe(false);
    expect(
      deriveRestartLegalReadiness({ ...ready, ball: { ...ready.ball, velocity: { x: 2, y: 0 } } })
        .ballReady,
    ).toBe(false);
    expect(
      deriveRestartLegalReadiness({
        ...ready,
        players: ready.players.map((player) =>
          player.id === ready.restart!.takerId ? { ...player, position: { x: 20, y: 34 } } : player,
        ),
      }).takerReady,
    ).toBe(false);
  });
  it('allows a quick free kick with an opponent who has not yet retreated', () => {
    const state = fixture('free_kick_wide');
    const opponent = state.players.find((player) => player.team === 'away')!;
    const close: TacticalMatchState = {
      ...state,
      players: state.players.map((player) =>
        player.id === opponent.id
          ? { ...player, position: { x: state.ball.x + 3, y: state.ball.y } }
          : player,
      ),
    };
    expect(deriveRestartLegalReadiness(close).opponentsReady).toBe(false);
    expect(
      deriveRestartLegalReadiness({ ...close, restart: { ...close.restart!, ceremonial: false } })
        .ready,
    ).toBe(true);
  });
  it('keeps the 1 m attacking restriction for a three-player wall even during a quick kick', () => {
    const state = fixture();
    const wall = state.players.filter((player) => state.restart!.roles[player.id]?.key === 'wall');
    expect(wall.length).toBeGreaterThanOrEqual(3);
    const attacker = state.players.find(
      (player) => player.team === 'home' && player.id !== state.restart!.takerId,
    )!;
    const close: TacticalMatchState = {
      ...state,
      restart: { ...state.restart!, ceremonial: false },
      players: state.players.map((player) =>
        player.id === attacker.id
          ? { ...player, position: { ...wall[0]!.position, y: wall[0]!.position.y + 0.5 } }
          : player,
      ),
    };
    expect(deriveRestartLegalReadiness(close).participantsReady).toBe(false);
  });
  it('rejects penalty encroachment and a keeper who is away from the goal line', () => {
    const state = fixture('penalty');
    const keeper = state.players.find(
      (player) => player.team === 'away' && player.profile.primaryPosition === 'goalkeeper',
    )!;
    const attacker = state.players.find(
      (player) => player.team === 'home' && player.id !== state.restart!.takerId,
    )!;
    expect(
      deriveRestartLegalReadiness({
        ...state,
        players: state.players.map((player) =>
          player.id === keeper.id ? { ...player, position: { x: 104, y: 34 } } : player,
        ),
      }).opponentsReady,
    ).toBe(false);
    expect(
      deriveRestartLegalReadiness({
        ...state,
        players: state.players.map((player) =>
          player.id === attacker.id ? { ...player, position: { x: 90, y: 34 } } : player,
        ),
      }).participantsReady,
    ).toBe(false);
  });
  it('measures corner distance from the arc instead of from a shifted ball', () => {
    const state = fixture('corner');
    const opponent = state.players.find((player) => player.team === 'away')!;
    const next: TacticalMatchState = {
      ...state,
      players: state.players.map((player) =>
        player.id === opponent.id ? { ...player, position: { x: 105 - 9.3, y: 0 } } : player,
      ),
    };
    expect(deriveRestartLegalReadiness(next).opponentsReady).toBe(false);
  });
  it.each(['half_time', 'full_time', 'abandoned'] as const)(
    'prevents release during %s',
    (status) => expect(deriveRestartLegalReadiness({ ...fixture(), status }).ready).toBe(false),
  );
  it('does not change real positions while deriving legal movement targets', () => {
    const state = fixture('penalty', 'away');
    const before = structuredClone(state);
    for (const player of state.players)
      legalizeRestartPlayerTarget(state, player, { x: 11, y: 34 });
    expect(state).toEqual(before);
  });
});

describe('PR159 offside incident provenance', () => {
  it('awards at the involvement point in the player own half, without teleporting to the old offside position', () => {
    const state = fixture('free_kick_wide');
    const passer = state.players.find((player) => player.team === 'home')!;
    const receiver = state.players.find(
      (player) => player.team === 'home' && player.id !== passer.id,
    )!;
    const { restart: _restart, ...uninterrupted } = state;
    void _restart;
    const open: TacticalMatchState = {
      ...uninterrupted,
      scenario: 'open_play',
      players: state.players.map((player) => ({
        ...player,
        position: { x: player.id === receiver.id ? 102 : player.team === 'away' ? 85 : 75, y: 34 },
      })),
      ball: { x: 75, y: 34 },
    };
    const snapshot = captureOffsideSnapshot(open, {
      type: 'pass',
      actorId: passer.id,
      receiverId: receiver.id,
      target: { x: 102, y: 34 },
      intent: 'direct',
    })!;
    expect(snapshot.offsidePlayerIds).toContain(receiver.id);
    const involved: TacticalMatchState = {
      ...open,
      time: 3,
      offsideSnapshot: snapshot,
      players: open.players.map((player) =>
        player.id === receiver.id ? { ...player, position: { x: 44, y: 30 } } : player,
      ),
      ball: { x: 44, y: 30 },
    };
    const awarded = awardOffsideRestart(involved, receiver.id, { x: 44, y: 30 });
    expect(awarded.restart).toMatchObject({
      indirect: true,
      spot: { x: 44, y: 30 },
      origin: 'live_event',
    });
    expect(awarded.players.map((player) => player.position)).toEqual(
      involved.players.map((player) => player.position),
    );
    expect(awarded.lastRestartAward).toMatchObject({
      incidentPosition: { x: 44, y: 30 },
      eventAt: 3,
      cause: 'offside',
    });
  });
});
