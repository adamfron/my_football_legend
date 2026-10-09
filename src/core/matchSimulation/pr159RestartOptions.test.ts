// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { createTacticalMatch } from './matchSimulation';
import { applyRestartScenario } from './restartScenarios';
import { enumerateContextualRestartActions } from './restartOptions';
import { canExecuteCanonicalShot, enumerateCanonicalShootingOptions } from './shootingOptions';
import { restartLawContract } from './restartLaws';
import type { RestartScenario, TacticalMatchState } from './matchState';
import type { TeamSide } from './matchSpace';

const world = createCanonicalWorldDatabase();
const fixture = (scenario: RestartScenario, team: TeamSide = 'home') => {
  const initial = createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: `pr159-options:${scenario}:${team}`,
      control: { mode: 'spectator' },
    }),
  );
  return applyRestartScenario(initial, scenario, { restartTeam: team });
};
const preparedContact = (state: TacticalMatchState): TacticalMatchState => {
  const spot = state.restart!.spot ?? state.ball;
  const actorId = state.restart!.takerId;
  return {
    ...state,
    ball: { x: spot.x, y: spot.y, height: 0, ownerId: actorId },
    players: state.players.map((player) =>
      player.id === actorId ? { ...player, position: { x: spot.x, y: spot.y } } : player,
    ),
  };
};

describe('PR159 restart menu shares physical shooting eligibility', () => {
  for (const team of ['home', 'away'] as const) {
    for (const scenario of [
      'free_kick_wide',
      'corner',
      'goal_kick',
      'gk_short',
      'kick_off',
      'penalty',
    ] as const) {
      it(`${team} ${scenario} retains ordinary direct shots and offers only supported chips`, () => {
        const state = fixture(scenario, team);
        const before = structuredClone(state);
        const actions = enumerateContextualRestartActions(state);
        const shots = actions.filter((action) => action.type === 'shot');
        expect(shots.some((action) => action.intent === 'driven' && !action.freeKickProfile)).toBe(
          true,
        );
        expect(shots.some((action) => action.intent === 'placed' && !action.freeKickProfile)).toBe(
          true,
        );
        const ready = preparedContact(state);
        for (const shot of shots) expect(canExecuteCanonicalShot(ready, shot)).toBe(true);
        expect(shots.some((action) => action.intent === 'chip')).toBe(
          enumerateCanonicalShootingOptions(ready, state.restart!.takerId).some(
            (action) => action.type === 'shot' && action.intent === 'chip',
          ),
        );
        expect(state).toEqual(before);
        if (scenario === 'corner') {
          expect(actions.some((action) => action.type === 'pass')).toBe(true);
          expect(actions.filter((action) => action.type === 'cross').length).toBeGreaterThanOrEqual(
            7,
          );
          expect(
            new Set(
              actions
                .filter((action) => action.type === 'cross')
                .map((action) => action.intendedTargetId),
            ).size,
          ).toBeGreaterThanOrEqual(3);
        }
        if (scenario === 'goal_kick' || scenario === 'gk_short') {
          expect(
            actions.some((action) => action.type === 'pass' && action.delivery === 'lofted'),
          ).toBe(true);
          expect(
            actions.some((action) => action.type === 'pass' && action.delivery !== 'lofted'),
          ).toBe(true);
        }
        if (scenario === 'kick_off')
          expect(actions.some((action) => action.type === 'pass')).toBe(true);
      });
    }
  }

  it('does not advertise a long-range chip that the physical resolver cannot execute', () => {
    for (const scenario of ['free_kick_wide', 'corner', 'goal_kick', 'kick_off'] as const) {
      expect(
        enumerateContextualRestartActions(fixture(scenario)).some(
          (action) => action.type === 'shot' && action.intent === 'chip',
        ),
      ).toBe(false);
    }
    expect(
      enumerateContextualRestartActions(fixture('penalty')).some(
        (action) => action.type === 'shot' && action.intent === 'chip',
      ),
    ).toBe(true);
  });

  it('retains short, crossed and space options for an indirect kick while a goal requires another touch', () => {
    const direct = fixture('free_kick_wide');
    const indirect = { ...direct, restart: { ...direct.restart!, indirect: true } };
    const actions = enumerateContextualRestartActions(indirect);
    expect(actions.some((action) => action.type === 'pass')).toBe(true);
    expect(actions.some((action) => action.type === 'cross')).toBe(true);
    expect(actions.some((action) => action.type === 'space_pass')).toBe(true);
    expect(actions.some((action) => action.type === 'shot')).toBe(false);
    expect(restartLawContract('free_kick_wide', true).requiresOtherPlayerTouch).toBe(true);
  });

  it('offers no restart after terminal state, a pending period end or an unavailable taker', () => {
    const state = fixture('corner');
    for (const status of ['full_time', 'half_time', 'abandoned'] as const)
      expect(enumerateContextualRestartActions({ ...state, status })).toEqual([]);
    expect(enumerateContextualRestartActions({ ...state, periodEndPending: true })).toEqual([]);
    expect(
      enumerateContextualRestartActions({
        ...state,
        players: state.players.filter((player) => player.id !== state.restart!.takerId),
      }),
    ).toEqual([]);
  });
});
