import { describe, expect, test } from 'vitest';
import type { WorldFootballer } from '../types/domain';
import { generateCanonicalFootballerProfile } from './footballerWorld';
import {
  NPC_RETIREMENT_HARD_MAX_AGE,
  processNpcRetirements,
  projectNpcRetirement,
  projectNpcRetirementAge,
} from './npcRetirement';
import { generateDevelopmentProfile } from './playerCreator';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta } from './worldDatabase';

const footballer = (
  id: string,
  position: 'striker' | 'goalkeeper',
  birthYear = 1990,
): WorldFootballer => ({
  profile: {
    ...generateCanonicalFootballerProfile({
      id,
      seed: id,
      age: 36,
      targetOverall: 60,
      primaryPosition: position,
    }),
    dateOfBirth: `${birthYear}-01-01`,
  },
  developmentProfile: generateDevelopmentProfile(RandomGenerator.fromSeed(`development:${id}`)),
  careerStatus: 'active',
  currentClubId: 'tiny',
});

describe('deterministic NPC retirement projection', () => {
  test('returns the same stable career end for repeated queries', () => {
    const player = footballer('stable', 'striker');
    expect(projectNpcRetirementAge(player, 'world')).toBe(projectNpcRetirementAge(player, 'world'));
    expect(
      projectNpcRetirement({ footballer: player, boundaryDate: '2030-07-01', seed: 'world' }),
    ).toEqual(
      projectNpcRetirement({ footballer: player, boundaryDate: '2030-07-01', seed: 'world' }),
    );
  });

  test('goalkeepers retire later across a deterministic sample', () => {
    const mean = (values: number[]) =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    const outfield = Array.from({ length: 200 }, (_, index) =>
      projectNpcRetirementAge(footballer(`sample-${index}`, 'striker'), 'world'),
    );
    const keepers = Array.from({ length: 200 }, (_, index) =>
      projectNpcRetirementAge(footballer(`sample-${index}`, 'goalkeeper'), 'world'),
    );
    expect(mean(keepers)).toBeGreaterThan(mean(outfield));
    expect(Math.max(...keepers, ...outfield)).toBeLessThanOrEqual(NPC_RETIREMENT_HARD_MAX_AGE);
  });

  test('hard maximum and a one-player squad cannot block retirement', () => {
    const old = footballer('last-player', 'goalkeeper', 1970);
    const protagonist = generateCanonicalFootballerProfile({
      id: 'hero',
      seed: 'hero',
      age: 16,
      targetOverall: 50,
      primaryPosition: 'striker',
    });
    const career = {
      seed: 'world',
      player: protagonist,
      currentDate: '2026-07-01',
      footballerWorld: { [old.profile.id]: old },
      clubWorld: [
        {
          id: 'tiny',
          name: 'Mały Klub',
          leagueTier: 4 as const,
          reputation: 10,
          financialLevel: 10,
          playingStyle: '',
          youthPolicy: 10,
          developmentReputation: 10,
          sellingClubTendency: 10,
          pressureLevel: 10,
          coachYouthTrust: 10,
          archetype: 'local_developer' as const,
          positionalNeeds: {
            goalkeeper: 'low' as const,
            defense: 'low' as const,
            midfield: 'low' as const,
            attack: 'low' as const,
          },
          squadPlayerIds: [old.profile.id],
        },
      ],
      worldDelta: emptyWorldDelta(),
    };
    const result = processNpcRetirements(career as never, '2027-07-01');
    expect(result.worldDelta!.retiredFootballerIds).toContain(old.profile.id);
    expect(result.worldDelta!.squadOverrides.tiny).toEqual([]);
  });
});
