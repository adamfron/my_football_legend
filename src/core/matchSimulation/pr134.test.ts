import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  applyRestartScenario,
  countSemanticPlayerChoices,
  createTacticalMatch,
  enumerateRestartActions,
  projectPlayerDecisionOpportunity,
  stepTacticalMatch,
  type PlayerDecisionOption,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = () =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr134',
      control: { mode: 'spectator' },
    }),
  );

const movement = (id: string, labelKey: string, type: 'hold_shape' | 'attack_space') =>
  ({
    id,
    kind: 'movement',
    labelKey,
    intent: { actorId: 'p', type, target: { x: 50, y: 34 }, startedAt: 0, expiresAt: 1 },
  }) satisfies PlayerDecisionOption;

describe('PR134 semantic player decisions', () => {
  it('collapses duplicate interception variants but preserves intercept versus holding shape', () => {
    const first = movement('i-1', 'intercept', 'attack_space');
    const second = movement('i-2', 'intercept_variant', 'attack_space');
    expect(countSemanticPlayerChoices([first, second], 'defensive_response')).toBe(1);
    expect(
      countSemanticPlayerChoices(
        [first, movement('hold', 'hold_line', 'hold_shape')],
        'defensive_response',
      ),
    ).toBe(2);
  });

  it('treats different restart receivers as meaningful choices', () => {
    const option = (receiverId: string): PlayerDecisionOption => ({
      id: receiverId,
      kind: 'action',
      labelKey: 'pass',
      action: {
        type: 'pass',
        actorId: 'taker',
        receiverId,
        target: { x: 50, y: 34 },
        intent: 'support',
      },
    });
    expect(countSemanticPlayerChoices([option('a'), option('b')], 'restart')).toBe(2);
  });
});

describe('PR134 restart liveness', () => {
  it('automatically releases a controlled throw-in when only one receiver is legal', () => {
    const restart = applyRestartScenario(makeState(), 'throw_in', {
      restartTeam: 'home',
      restartPoint: { x: 45, y: 0 },
    });
    restart.controlledFootballerId = restart.restart!.takerId;
    const taker = restart.players.find((player) => player.id === restart.restart!.takerId)!;
    const teammates = restart.players.filter(
      (player) => player.team === taker.team && player.id !== taker.id,
    );
    teammates.forEach((player, index) => {
      player.position = index === 0 ? { x: taker.position.x + 5, y: 3 } : { x: 90, y: 60 };
    });
    expect(enumerateRestartActions(restart)).toHaveLength(1);
    expect(projectPlayerDecisionOpportunity(restart)).toBeUndefined();
    let current = restart;
    for (let tick = 0; tick < 90; tick += 1) current = stepTacticalMatch(current, 0.025);
    expect(current.restart?.phase).toBe('release');
    expect(current.latestAction?.type).toBe('header');
  });

  it('surfaces a controlled throw-in when several receivers are legal', () => {
    const restart = applyRestartScenario(makeState(), 'throw_in', {
      restartTeam: 'home',
      restartPoint: { x: 45, y: 0 },
    });
    restart.controlledFootballerId = restart.restart!.takerId;
    expect(enumerateRestartActions(restart).length).toBeGreaterThan(1);
    expect(projectPlayerDecisionOpportunity(restart)?.kind).toBe('restart');
  });
});
