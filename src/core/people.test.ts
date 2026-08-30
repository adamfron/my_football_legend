import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { upsertPerson } from './people';

describe('person identity', () => {
  it('upserts the same coach instead of duplicating them', () => {
    const player = generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 180,
        weightKg: 74,
        seed: 'people',
      },
      'people',
      0,
    );
    const career = createCareerState(player, 'people');
    const coach = {
      ...career.significantPeople[0]!,
      id: 'coach_stable',
      firstName: 'Robert',
      lastName: 'Maj',
      role: 'coach',
    };
    const once = upsertPerson(career, coach);
    const twice = upsertPerson(once, { ...coach, age: coach.age + 1 });
    expect(
      twice.significantPeople.filter(
        (person) => person.firstName === 'Robert' && person.lastName === 'Maj',
      ),
    ).toHaveLength(1);
    expect(twice.relationships.coach_stable).toBeDefined();
  });
});
