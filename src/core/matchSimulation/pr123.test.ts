import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../singleMatch';
import {
  createTacticalMatch,
  deriveLeadPass,
  deriveFinalThirdOccupations,
  enumerateAvailableActions,
  projectPassReception,
  resolveMatchAction,
} from '.';

const world = createCanonicalWorldDatabase();
const makeState = (controlled = false) => {
  const home = world.clubs[0]!;
  return createTacticalMatch(
    createSingleMatchSession(world, {
      homeClubId: home.id,
      awayClubId: world.clubs[1]!.id,
      seed: 'pr123-regression',
      control: controlled
        ? {
            mode: 'player',
            clubId: home.id,
            footballerId: home.squadPlayerIds![0]!,
            forceIntoXI: true,
          }
        : { mode: 'spectator' },
    }),
  );
};

describe('PR123 final-third and interaction integrity', () => {
  it.each([['home', 78] as const, ['away', 27] as const])(
    'derives onside, team-symmetric final-third occupations for %s',
    (side, ballX) => {
      const state = makeState();
      const carrier = state.players.find(
        (player) => player.team === side && player.profile.primaryPosition !== 'goalkeeper',
      )!;
      carrier.position = { x: ballX, y: 8 };
      state.ball = { ...carrier.position, ownerId: carrier.id };
      state.possessionTeam = side;
      state.timeSincePossessionChanged = 4;
      for (const player of state.players.filter((candidate) => candidate.team !== side))
        player.position.x = side === 'home' ? 98 : 7;
      const occupations = deriveFinalThirdOccupations(state, side);
      expect(occupations.length).toBeGreaterThan(0);
      expect(occupations.some(({ occupation }) => occupation === 'near_post')).toBe(true);
      for (const { target } of occupations)
        expect(side === 'home' ? target.x < 98 : target.x > 7).toBe(true);
    },
  );

  it('rejects an autonomous controlled shot at the exact commit boundary', () => {
    const state = makeState(true);
    const actor = state.players.find((player) => player.id === state.ball.ownerId)!;
    state.controlledFootballerId = actor.id;
    const shot = enumerateAvailableActions(state, actor.id).find(
      (action) => action.type === 'shot',
    )!;
    expect(resolveMatchAction(state, shot, 'autonomous_npc')).toBe(state);
    expect(resolveMatchAction(state, shot, 'human_selected').latestActionSource).toBe(
      'human_selected',
    );
  });

  it('fades outward prediction near touch while preserving the forward channel lead', () => {
    const state = makeState();
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    passer.position = { x: 58, y: 9 };
    receiver.position = { x: 68, y: 1.5 };
    receiver.target = { x: 85, y: -5 };
    receiver.velocity = { x: 6, y: -4 };
    const projection = projectPassReception(state, passer, receiver, 'progressive');
    expect(projection.releaseTarget.x).toBeGreaterThan(receiver.position.x);
    expect(projection.releaseTarget.y).toBeGreaterThan(0.5);
  });

  it.each(['home', 'away'] as const)(
    'offers a bounded lead point for a moving %s runner',
    (side) => {
      const state = makeState();
      const passer = state.players.find(
        (player) => player.team === side && player.profile.primaryPosition !== 'goalkeeper',
      )!;
      const receiver = state.players.find(
        (player) =>
          player.team === side &&
          player.id !== passer.id &&
          player.profile.primaryPosition !== 'goalkeeper',
      )!;
      const direction = side === 'home' ? 1 : -1;
      passer.position = { x: side === 'home' ? 45 : 60, y: 30 };
      receiver.position = { x: passer.position.x + direction * 10, y: 18 };
      receiver.target = { x: receiver.position.x + direction * 18, y: 12 };
      receiver.velocity = { x: direction * 5, y: -1.5 };
      for (const opponent of state.players.filter((player) => player.team !== side))
        opponent.position = { x: side === 'home' ? 20 : 85, y: 50 };
      const lead = deriveLeadPass(state, passer, receiver);
      expect(lead).toBeDefined();
      expect(direction * (lead!.projection.releaseTarget.x - receiver.position.x)).toBeGreaterThan(
        0,
      );
      expect(lead!.projection.releaseTarget.x).toBeGreaterThanOrEqual(0);
      expect(lead!.projection.releaseTarget.x).toBeLessThanOrEqual(105);
      expect(lead!.projection.releaseTarget.y).toBeGreaterThanOrEqual(0);
      expect(lead!.projection.releaseTarget.y).toBeLessThanOrEqual(68);
    },
  );

  it('does not duplicate a feet pass for a stationary receiver', () => {
    const state = makeState();
    const passer = state.players.find((player) => player.id === state.ball.ownerId)!;
    const receiver = state.players.find(
      (player) => player.team === passer.team && player.id !== passer.id,
    )!;
    receiver.velocity = { x: 0, y: 0 };
    receiver.target = { ...receiver.position };
    expect(deriveLeadPass(state, passer, receiver)).toBeUndefined();
  });
});
