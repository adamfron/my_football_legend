import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import { RandomGenerator } from '../random/RandomGenerator';
import {
  createTacticalMatch,
  evaluateMatchSituation,
  evaluateShootingOpportunity,
  resolveGroundPassClaim,
  type TacticalMatchState,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (seed = 'situation') =>
  createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: world.clubs[0]!.id,
      awayClubId: world.clubs[1]!.id,
      seed,
      control: { mode: 'spectator' },
    }),
  );
const owner = (state: TacticalMatchState) =>
  state.players.find((p) => p.id === state.ball.ownerId)!;

describe('canonical match situation evaluator', () => {
  it('distinguishes teammate possession from opponent possession', () => {
    const state = makeState();
    const actor = owner(state);
    const teammate = state.players.find(
      (player) => player.team === actor.team && player.id !== actor.id,
    )!;
    state.ball = { ...teammate.position, ownerId: teammate.id };
    expect(evaluateMatchSituation(state, actor.id).context.possession).toBe('team');
  });

  it('separates routine, pressure, central chances, poor angles and transitions', () => {
    const state = makeState();
    const actor = owner(state);
    actor.position = { x: 52, y: 34 };
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 75, y: p.position.y };
      });
    expect(evaluateMatchSituation(state, actor.id).kind).toBe('routine');
    state.players.find((p) => p.team !== actor.team)!.position = { x: 52.5, y: 34 };
    expect(evaluateMatchSituation(state, actor.id).kind).toBe('under_pressure');
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 60, y: p.position.y };
      });
    actor.position = { x: 87, y: 34 };
    expect(evaluateMatchSituation(state, actor.id).kind).toBe('shooting_opportunity');
    actor.position = { x: 87, y: 3 };
    expect(evaluateMatchSituation(state, actor.id).reasons).toContain('poor_shooting_angle');
    state.teams.home.phase = 'attacking_transition';
    expect(evaluateMatchSituation(state, actor.id).kind).toBe('attacking_transition');
  });

  it('recognises defensive threat, loose balls and set pieces', () => {
    const state = makeState();
    const defender = state.players.find((p) => p.team === 'away')!;
    defender.position = { x: 92, y: 34 };
    expect(evaluateMatchSituation(state, defender.id).kind).toBe('defensive_duel');
    delete state.ball.ownerId;
    expect(evaluateMatchSituation(state, defender.id).kind).toBe('loose_ball');
    state.scenario = 'corner';
    expect(evaluateMatchSituation(state, defender.id).kind).toBe('set_piece');
  });

  it('is stable, non-mutating and does not affect deterministic RNG', () => {
    const state = makeState('pure');
    const before = structuredClone(state);
    const expected = RandomGenerator.fromSeed('independent').float();
    expect(evaluateMatchSituation(state)).toEqual(evaluateMatchSituation(state));
    expect(state).toEqual(before);
    expect(RandomGenerator.fromSeed('independent').float()).toBe(expected);
  });
});

describe('shooting opportunity', () => {
  it('favours 18m over 35m and penalises pressure and blockers', () => {
    const state = makeState();
    const actor = owner(state);
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 50, y: p.position.y };
      });
    actor.position = { x: 87, y: 34 };
    const close = evaluateShootingOpportunity(state, actor).value;
    actor.position = { x: 70, y: 34 };
    const long = evaluateShootingOpportunity(state, actor).value;
    expect(close).toBeGreaterThan(long);
    const defender = state.players.find((p) => p.team !== actor.team)!;
    defender.position = { x: 71, y: 34 };
    expect(evaluateShootingOpportunity(state, actor).value).toBeLessThan(long);
  });

  it('lets quality improve but not normalise a long shot', () => {
    const state = makeState();
    const actor = owner(state);
    actor.position = { x: 69, y: 34 };
    state.players
      .filter((p) => p.team !== actor.team)
      .forEach((p) => {
        p.position = { x: 45, y: p.position.y };
      });
    actor.profile.attributes.finishing =
      actor.profile.attributes.technique =
      actor.profile.attributes.composure =
        35;
    const weak = evaluateShootingOpportunity(state, actor).value;
    actor.profile.attributes.finishing =
      actor.profile.attributes.technique =
      actor.profile.attributes.composure =
        95;
    const strong = evaluateShootingOpportunity(state, actor).value;
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThan(0.62);
  });
});

describe('ground pass contact', () => {
  it('claims only at the landing point, permits interception and otherwise stays loose', () => {
    const state = makeState();
    const passer = owner(state);
    const receiver = state.players.find((p) => p.team === passer.team && p.id !== passer.id)!;
    const defender = state.players.find((p) => p.team !== passer.team)!;
    state.currentActorId = passer.id;
    const landing = { x: 61, y: 31 };
    receiver.position = { x: 62, y: 31 };
    defender.position = { x: 70, y: 31 };
    expect(resolveGroundPassClaim(state, landing)).toMatchObject({
      landingPosition: landing,
      playerId: receiver.id,
      cause: 'claim',
    });
    receiver.position = { x: 67, y: 31 };
    expect(resolveGroundPassClaim(state, landing).playerId).toBeUndefined();
    defender.position = { x: 61.5, y: 31 };
    expect(resolveGroundPassClaim(state, landing)).toMatchObject({
      playerId: defender.id,
      cause: 'interception',
    });
    defender.position = { x: 70, y: 31 };
    expect(resolveGroundPassClaim(state, landing)).toEqual({ landingPosition: landing });
    expect(resolveGroundPassClaim(state, landing)).toEqual(resolveGroundPassClaim(state, landing));
  });
});
