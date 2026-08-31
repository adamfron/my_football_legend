import { describe, expect, test } from 'vitest';
import { generateProfessionalClubPool } from './professionalClubs';
import { deriveYouthTeamQuality, populatePolishU17World } from './youthWorld';

describe('persistent Polish U-17 world', () => {
  const clubs = generateProfessionalClubPool('youth-test');

  test('derives quality mainly from academy environment', () => {
    const base = clubs[0]!;
    const excellentAcademy = {
      ...base,
      developmentReputation: 90,
      youthPolicy: 90,
      infrastructure: { ...base.infrastructure!, coachingQuality: 90, trainingFacilities: 90 },
    };
    const weakAcademy = {
      ...base,
      developmentReputation: 30,
      youthPolicy: 30,
      infrastructure: { ...base.infrastructure!, coachingQuality: 35, trainingFacilities: 35 },
    };
    expect(
      deriveYouthTeamQuality(excellentAcademy) - deriveYouthTeamQuality(weakAcademy),
    ).toBeGreaterThan(30);
    expect(
      deriveYouthTeamQuality({ ...base, strengthRating: 85 }) -
        deriveYouthTeamQuality({ ...base, strengthRating: 35 }),
    ).toBeLessThanOrEqual(3);
  });

  test('generates byte-equivalent cohorts from the same seed', () => {
    expect(JSON.stringify(populatePolishU17World(clubs, 'stable'))).toBe(
      JSON.stringify(populatePolishU17World(clubs, 'stable')),
    );
  });
});
