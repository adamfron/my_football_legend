import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { formatClubStars, getClubStars, getExpectedSquadRole } from './clubStrength';
import { generateProfessionalClubPool } from './professionalClubs';

const careerAtOverall = (value: number) => {
  const input = {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'Polska',
    birthDate: '2010-01-01',
    primaryPosition: 'central_midfielder' as const,
    dominantFoot: 'right' as const,
    heightCm: 180,
    weightKg: 74,
    seed: 'club-strength-test',
  };
  const career = createCareerState(generateStartingPlayerProfile(input, input.seed, 0), input.seed);
  for (const key of Object.keys(career.player.attributes) as Array<
    keyof typeof career.player.attributes
  >)
    career.player.attributes[key] = value;
  return career;
};

describe('canonical club strength model', () => {
  it('maps 0..100 deterministically to half-star increments', () => {
    expect(getClubStars(71)).toBe(3.5);
    expect(formatClubStars(71)).toBe('★★★½☆');
    expect(getClubStars(100)).toBe(5);
  });
  it('protects role calibration from enormous quality gaps', () => {
    const weak = { ...generateProfessionalClubPool('roles')[48]!, strengthRating: 50 };
    const strong = { ...weak, strengthRating: 70 };
    expect(getExpectedSquadRole(careerAtOverall(86), weak)).toBe('star_player');
    expect(['first_team_competition', 'important_player', 'star_player']).toContain(
      getExpectedSquadRole(careerAtOverall(75), strong),
    );
    expect(['rotation', 'development_player']).toContain(
      getExpectedSquadRole(careerAtOverall(60), strong),
    );
  });
});
