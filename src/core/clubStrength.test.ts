import { describe, expect, it } from 'vitest';
import type { CareerState, PlayerAttributes } from '../types/domain';
import {
  createCareerState,
  generateStartingPlayerProfile,
  STARTING_AGE,
  type CreatorInput,
} from './playerCreator';
import { getClubStars, getExpectedSquadRole } from './clubStrength';
import { createProceduralFootballerId } from './proceduralFootballers';

const careerAtOverall = (value: number) => {
  const input: CreatorInput = {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'PL',
    age: STARTING_AGE,
    position: 'striker',
    dominantFoot: 'right',
    customSeed: '',
    heightCm: 180,
    weightKg: 74,
    seed: `club-strength-${value}`,
  };
  const career = createCareerState(generateStartingPlayerProfile(input, input.seed, 0), input.seed);
  for (const key of Object.keys(career.player.attributes) as Array<keyof PlayerAttributes>)
    career.player.attributes[key] = value;
  return career;
};

const withPositionCompetition = (playerOverall: number, competitorValues: number[]) => {
  const career = careerAtOverall(playerOverall);
  const club = career.clubWorld![0]!;
  const competitors = club.squadPlayerIds!.filter(
    (id) => career.footballerWorld![id]!.profile.primaryPosition === 'striker',
  );
  const attributes = Object.keys(career.player.attributes) as Array<keyof PlayerAttributes>;
  const footballerAttributeOverrides = Object.fromEntries(
    competitors.map((id, index) => [
      id,
      Object.fromEntries(attributes.map((key) => [key, competitorValues[index] ?? 35])),
    ]),
  );
  return {
    career: {
      ...career,
      currentProfessionalClub: club,
      worldDelta: { ...career.worldDelta!, footballerAttributeOverrides },
    } as CareerState,
    club,
  };
};

describe('canonical club strength model', () => {
  it('maps 0..100 deterministically to half-star increments', () => {
    expect(getClubStars(71)).toBe(3.5);
    expect(getClubStars(25)).toBe(1.5);
    expect(getClubStars(100)).toBe(5);
  });

  it('derives promised role from real effective positional competition', () => {
    const dominant = withPositionCompetition(90, [55, 50, 45]);
    const comparable = withPositionCompetition(75, [74, 65, 55]);
    const slightlyBelow = withPositionCompetition(68, [72, 71, 50]);
    const crowdedOut = withPositionCompetition(45, [75, 70, 65]);

    expect(['star_player', 'important_player']).toContain(
      getExpectedSquadRole(dominant.career, dominant.club),
    );
    expect(['important_player', 'first_team_competition']).toContain(
      getExpectedSquadRole(comparable.career, comparable.club),
    );
    expect(['first_team_competition', 'rotation']).toContain(
      getExpectedSquadRole(slightlyBelow.career, slightlyBelow.club),
    );
    expect(['rotation', 'development_player']).toContain(
      getExpectedSquadRole(crowdedOut.career, crowdedOut.club),
    );
  });

  it('uses the canonical resolver for a procedural competitor', () => {
    const { career, club } = withPositionCompetition(82, [50, 45, 40]);
    const before = getExpectedSquadRole(career, club);
    const proceduralId = createProceduralFootballerId({
      kind: 'supplemental',
      ownerId: club.id,
      season: 2027,
      position: 'striker',
      slot: 99,
    });
    const attributes = Object.fromEntries(
      (Object.keys(career.player.attributes) as Array<keyof PlayerAttributes>).map((key) => [
        key,
        99,
      ]),
    );
    const withProcedural: CareerState = {
      ...career,
      worldDelta: {
        ...career.worldDelta!,
        squadOverrides: {
          ...career.worldDelta!.squadOverrides,
          [club.id]: [...club.squadPlayerIds!, proceduralId],
        },
        footballerAttributeOverrides: {
          ...career.worldDelta!.footballerAttributeOverrides,
          [proceduralId]: attributes,
        },
      },
    };
    expect(before).toBe('star_player');
    expect(getExpectedSquadRole(withProcedural, club)).not.toBe('star_player');
  });

  it('reports an initialized professional squad without a legal XI', () => {
    const career = careerAtOverall(80);
    const club = { ...career.clubWorld![0]!, id: 'legacy-incomplete', squadPlayerIds: [] };
    expect(() => getExpectedSquadRole(career, club)).toThrow('no canonical legal XI');
  });
});
