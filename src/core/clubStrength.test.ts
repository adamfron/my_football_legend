import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  STARTING_AGE,
  type CreatorInput,
} from './playerCreator';
import { getClubStars, getExpectedSquadRole } from './clubStrength';
import { generateProfessionalClubPool } from './professionalClubs';

const careerAtOverall = (value: number) => {
  const input: CreatorInput = {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'PL',
    age: STARTING_AGE,
    position: 'attacking_midfielder',
    dominantFoot: 'right',
    customSeed: '',
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
    expect(getClubStars(25)).toBe(1.5);
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
  it('uses one role model across weak, comparable and stronger clubs', () => {
    const base = generateProfessionalClubPool('role-range')[32]!;
    const player = careerAtOverall(67);
    const roleAt = (strengthRating: number) =>
      getExpectedSquadRole(player, { ...base, strengthRating });
    expect(['star_player', 'important_player']).toContain(roleAt(45));
    expect(['important_player', 'first_team_competition']).toContain(roleAt(52));
    expect(['first_team_competition', 'rotation']).toContain(roleAt(60));
    expect(['rotation', 'development_player']).toContain(roleAt(68));
  });
});
