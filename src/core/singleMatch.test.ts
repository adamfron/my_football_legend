import { describe, expect, it } from 'vitest';
import { createCanonicalWorldDatabase } from '../../scripts/createCanonicalWorldDatabase';
import { createSingleMatchSession, singleMatchSetupSchema } from './singleMatch';
import {
  createSingleMatchScenarioAliases,
  createSingleMatchTacticalPlayers,
} from '../app/match/singleMatchScenarioAliases';
import { getCurrentXIStrength } from './footballerWorld';
import { getEffectivePositionOverall } from './playerOverall';

const world = createCanonicalWorldDatabase();
const home = world.clubs[0]!;
const away = world.clubs[1]!;
const controlledId = home.squadPlayerIds!.at(-1)!;
const setup = {
  homeClubId: home.id,
  awayClubId: away.id,
  control: {
    mode: 'player' as const,
    clubId: home.id,
    footballerId: controlledId,
    forceIntoXI: true,
  },
  seed: 'repro-89',
};

describe('Single Match Lab domain session', () => {
  it('recreates a deterministic canonical 11 v 11 state', () => {
    const first = createSingleMatchSession(world, setup);
    expect(createSingleMatchSession(world, setup)).toEqual(first);
    expect(first.home.players).toHaveLength(11);
    expect(first.away.players).toHaveLength(11);
    expect(first.home.players.every((player) => world.footballers[player.footballerId])).toBe(true);
    expect(first.away.players.every((player) => world.footballers[player.footballerId])).toBe(true);
    expect(first.home.players.some((player) => player.footballerId === controlledId)).toBe(true);
  });

  it('uses the seed for a different but valid kickoff arrangement', () => {
    const first = createSingleMatchSession(world, setup);
    const second = createSingleMatchSession(world, { ...setup, seed: 'another-seed' });
    expect(second.home.players).toHaveLength(11);
    expect(second.home.players.map((player) => [player.x, player.y])).not.toEqual(
      first.home.players.map((player) => [player.x, player.y]),
    );
  });

  it('rejects the same club and a footballer outside the controlled club', () => {
    expect(() => singleMatchSetupSchema.parse({ ...setup, awayClubId: home.id })).toThrow();
    expect(() =>
      createSingleMatchSession(world, {
        ...setup,
        control: {
          mode: 'player',
          clubId: home.id,
          footballerId: away.squadPlayerIds![0]!,
          forceIntoXI: true,
        },
      }),
    ).toThrow(/nie należy/);
  });

  it('forces the protagonist without mutating the canonical squad', () => {
    const before = [...home.squadPlayerIds!];
    const session = createSingleMatchSession(world, setup);
    expect(
      session.home.players.find((player) => player.footballerId === controlledId),
    ).toBeDefined();
    expect(home.squadPlayerIds).toEqual(before);
    expect(session.home.strength).toBe(
      getCurrentXIStrength(
        session.home.players.map((player) => ({
          effectiveOverall: getEffectivePositionOverall(player.profile, player.slot.position),
        })),
      ),
    );
  });

  it.each([['home', home, away] as const, ['away', away, home] as const])(
    'keeps a %s-controlled protagonist on the correct tactical side',
    (_, controlled, opponent) => {
      const controlledId = controlled.squadPlayerIds!.at(-1)!;
      const session = createSingleMatchSession(world, {
        ...setup,
        control: {
          mode: 'player',
          clubId: controlled.id,
          footballerId: controlledId,
          forceIntoXI: true,
        },
        homeClubId: controlled === home ? controlled.id : opponent.id,
        awayClubId: controlled === away ? controlled.id : opponent.id,
      });
      const tactical = createSingleMatchTacticalPlayers(session);
      const protagonist = tactical.filter((player) => player.protagonist);
      expect(protagonist).toHaveLength(1);
      expect(protagonist[0]).toMatchObject({
        id: controlledId,
        team: controlled.id === session.home.club.id ? 'home' : 'away',
      });
      const aliases = createSingleMatchScenarioAliases(session);
      expect(aliases[controlled.id === session.home.club.id ? 'home-6' : 'away-6']).toBe(
        controlledId,
      );
      expect(
        Object.entries(aliases).some(
          ([role, id]) =>
            role.startsWith(controlled.id === session.home.club.id ? 'away' : 'home') &&
            id === controlledId,
        ),
      ).toBe(false);
    },
  );
});
