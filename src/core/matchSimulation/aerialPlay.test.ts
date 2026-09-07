import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  aerialAbility,
  applyRestartScenario,
  chooseRestartAction,
  createTacticalMatch,
  goalkeeperIntervention,
  matchActionSchema,
  resolveAerialDuel,
  resolveDeadBallRestart,
  resolveMatchAction,
  secondBallPriority,
  stepTacticalMatch,
  tacticalMatchStateSchema,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (seed = 'aerial') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );

const finishFlight = (input: ReturnType<typeof makeState>) => {
  let state = input;
  for (let i = 0; i < 100 && state.ball.travelDuration; i++) state = stepTacticalMatch(state, 0.1);
  return state;
};

describe('canonical airborne play', () => {
  it('makes crosses parametric airborne travel and renders only core height', () => {
    const initial = makeState();
    const actor = initial.players.find(
      (p) => p.team === 'home' && p.profile.primaryPosition !== 'goalkeeper',
    )!;
    const positioned = {
      ...initial,
      players: initial.players.map((p) =>
        p.id === actor.id ? { ...p, position: { x: 82, y: 8 } } : p,
      ),
      ball: { x: 82, y: 8, ownerId: actor.id },
    };
    const state = resolveMatchAction(positioned, {
      type: 'cross',
      actorId: actor.id,
      target: { x: 94, y: 34 },
      intent: 'floated',
    });
    expect(state.ball).toMatchObject({
      airborne: true,
      travelKind: 'cross',
      sourceAction: 'cross',
    });
    expect(stepTacticalMatch(state, state.ball.travelDuration! / 2).ball.height).toBeGreaterThan(0);
  });

  it('uses the same deterministic resolver for protagonist and NPC', () => {
    const state = makeState('parity');
    const controlled = { ...state, controlledFootballerId: state.players[5]!.id };
    expect(resolveAerialDuel(state)).toEqual(resolveAerialDuel(controlled));
    expect(resolveAerialDuel(state)).toEqual(resolveAerialDuel(state));
  });

  it('permits seed variation without making superior aerial skill a guarantee', () => {
    const base = makeState();
    const point = { x: 52.5, y: 34 };
    const local = base.players
      .slice(0, 2)
      .map((p, index) => ({ ...p, position: { x: 52 + index, y: 34 } }));
    expect(
      aerialAbility(
        {
          ...local[0]!,
          profile: {
            ...local[0]!.profile,
            heightCm: 200,
            attributes: { ...local[0]!.profile.attributes, heading: 95, jumping: 95 },
          },
        },
        point,
      ),
    ).toBeGreaterThan(aerialAbility(local[1]!, point));
    const outcomes = new Set(
      Array.from(
        { length: 30 },
        (_, i) =>
          resolveAerialDuel({
            ...base,
            seed: `variation-${i}`,
            ball: { ...point, height: 2, airborne: true },
            players: [
              ...local,
              ...base.players.slice(2).map((p) => ({
                ...p,
                position: p.team === 'home' ? { x: 10, y: 10 } : { x: 95, y: 58 },
              })),
            ],
          }).outcome,
      ),
    );
    expect(outcomes.size).toBeGreaterThan(1);
  });

  it('routes direct corners, wide free kicks and long goal kicks through airborne travel', () => {
    for (const scenario of ['corner', 'free_kick_wide', 'goal_kick'] as const) {
      let state = applyRestartScenario(makeState(`delivery-${scenario}`), scenario);
      if (scenario === 'corner')
        state = { ...state, restart: { ...state.restart!, cornerPlan: 'direct_near_post' } };
      const action = chooseRestartAction(state)!;
      const released = resolveMatchAction(state, action);
      expect(released.ball.airborne).toBe(true);
      expect(scenario === 'goal_kick' ? released.ball.travelKind : action.type).toBe(
        scenario === 'goal_kick' ? 'long_distribution' : 'cross',
      );
      const result = finishFlight(released);
      expect(result.lastAerialResult).toBeDefined();
    }
  });

  it('models every header intent in the canonical validated action type', () => {
    for (const intent of ['header_shot', 'header_pass', 'flick', 'header_clearance'] as const)
      expect(
        matchActionSchema.safeParse({
          type: 'header',
          actorId: 'p',
          target: { x: 50, y: 34 },
          intent,
        }).success,
      ).toBe(true);
  });

  it('allows reachable keeper claims/punches but rejects remote crosses', () => {
    const base = makeState();
    const keeper = base.players.find(
      (p) => p.team === 'away' && p.profile.primaryPosition === 'goalkeeper',
    )!;
    const reachable = {
      ...base,
      possessionTeam: 'home' as const,
      ball: { x: 101, y: 34, height: 4 },
      players: base.players.map((p) =>
        p.id === keeper.id
          ? {
              ...p,
              position: { x: 102, y: 34 },
              profile: {
                ...p.profile,
                attributes: { ...p.profile.attributes, handling: 95, reflexes: 95 },
              },
            }
          : p,
      ),
    };
    expect(['claim', 'punch']).toContain(goalkeeperIntervention(reachable).decision);
    expect(
      goalkeeperIntervention({ ...reachable, ball: { x: 65, y: 34, height: 4 } }).decision,
    ).toBe('stay');
  });

  it('prioritises tactical second-ball roles and resolves all dead-ball boundaries', () => {
    const restart = applyRestartScenario(makeState(), 'goal_kick');
    const contestant = restart.players[0]!;
    const priority = secondBallPriority(restart, [contestant]);
    expect(priority).toContain(contestant.id);
    for (const [id, role] of Object.entries(restart.restart!.roles))
      if (role.intent === 'attack_second_ball') expect(priority).toContain(id);
    expect(
      resolveDeadBallRestart(
        { ...restart, ball: { x: 50, y: 34, lastTouchPlayerId: contestant.id } },
        { x: 50, y: -1 },
      ),
    ).toBe('throw_in');
    expect(['goal_kick', 'corner']).toContain(resolveDeadBallRestart(restart, { x: -1, y: 34 }));
  });

  it('keeps canonical coordinates finite and schema-valid through an aerial sequence', () => {
    const corner = applyRestartScenario(makeState('finite'), 'corner');
    const direct = {
      ...corner,
      restart: { ...corner.restart!, cornerPlan: 'direct_mixed_or_far' as const },
    };
    const result = finishFlight(resolveMatchAction(direct, chooseRestartAction(direct)!));
    expect(
      result.players.every(
        (p) =>
          Number.isFinite(p.position.x + p.position.y) &&
          p.position.x >= 0 &&
          p.position.x <= 105 &&
          p.position.y >= 0 &&
          p.position.y <= 68,
      ),
    ).toBe(true);
    expect(() => tacticalMatchStateSchema.parse(result)).not.toThrow();
  });
});
