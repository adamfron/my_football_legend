import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyRestartScenario,
  chooseRestartAction,
  createTacticalMatch,
  deriveTeamShapeMetrics,
  distance,
  tacticalSituationDefinitionSchema,
  TACTICAL_SITUATION_PLAYBOOK,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (seed = 'playbook') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

describe('tactical situation playbook', () => {
  it('validates declarative definitions and produces deterministic role targets', () => {
    Object.values(TACTICAL_SITUATION_PLAYBOOK).forEach((entry) =>
      expect(() => tacticalSituationDefinitionSchema.parse(entry)).not.toThrow(),
    );
    const initial = makeState('repeatable-roles');
    expect(applyRestartScenario(initial, 'corner')).toEqual(
      applyRestartScenario(initial, 'corner'),
    );
  });

  it('enforces kick-off and goal-kick setup laws', () => {
    const kickOff = applyRestartScenario(makeState(), 'kick_off');
    const taker = kickOff.restart!.takerId;
    expect(kickOff.ball).toMatchObject({ x: 52.5, y: 34, ownerId: taker });
    expect(
      kickOff.players.every(
        (p) => p.id === taker || (p.team === 'home' ? p.position.x < 52.5 : p.position.x > 52.5),
      ),
    ).toBe(true);
    expect(
      kickOff.players
        .filter((p) => p.team === 'away')
        .every((p) => distance(p.position, kickOff.ball) >= 9.15),
    ).toBe(true);
    for (const scenario of ['goal_kick', 'gk_short'] as const) {
      const state = applyRestartScenario(makeState(), scenario);
      expect(
        state.players
          .filter((p) => p.team === 'away')
          .every((p) => p.position.x > 16.5 || p.position.y < 13.84 || p.position.y > 54.16),
      ).toBe(true);
    }
  });

  it('gives every restart a taker, role graph and executable motive', () => {
    for (const scenario of [
      'kick_off',
      'goal_kick',
      'gk_short',
      'corner',
      'free_kick_far',
      'free_kick_close',
      'free_kick_wide',
      'penalty',
    ] as const) {
      const state = applyRestartScenario(makeState(`motive-${scenario}`), scenario);
      expect(state.players.some((p) => p.id === state.restart!.takerId)).toBe(true);
      expect(Object.keys(state.restart!.roles)).toHaveLength(22);
      expect(state.restart!.executionChoices.length).toBeGreaterThan(0);
      expect(chooseRestartAction(state)).toBeDefined();
    }
  });

  it('creates limited short pressure and layered long distribution roles', () => {
    const short = applyRestartScenario(makeState('short-unit'), 'gk_short');
    expect(
      Object.values(short.restart!.roles).filter((r) => r.key === 'first_press').length,
    ).toBeLessThanOrEqual(3);
    const long = applyRestartScenario(makeState('long-layers'), 'goal_kick');
    for (const key of ['contestants', 'second_ball', 'rest'])
      expect(Object.values(long.restart!.roles).some((role) => role.key === key)).toBe(true);
  });

  it('derives finite ephemeral shape diagnostics and keeps random out of match core', () => {
    const state = makeState();
    for (const side of ['home', 'away'] as const)
      expect(
        JSON.stringify(deriveTeamShapeMetrics(state, side)).includes('null'),
      ).toBe(false);
    const files = import.meta.glob('./*.ts', { query: '?raw', import: 'default', eager: true });
    expect(
      Object.entries(files).filter(
        ([name, source]) => !name.endsWith('.test.ts') && String(source).includes('Math.random('),
      ),
    ).toEqual([]);
    expect(String(files['./restartGeometry.ts'])).not.toContain('player-');
  });
});
