import { describe, expect, test } from 'vitest';
import type {
  CareerState,
  DevelopmentProfile,
  PlayerAttributes,
  WorldFootballer,
} from '../types/domain';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { generateCanonicalFootballerProfile, resolveFootballer } from './footballerWorld';
import {
  aggregateDevelopment,
  processNpcSeasonDevelopment,
  projectNpcAttributesAtDate,
} from './seasonDevelopment';
import { getRadarAxes } from './radar';
import { emptyWorldDelta } from './worldDatabase';

const development: DevelopmentProfile = {
  developmentType: 'normal',
  growthRate: 1.2,
  developmentVolatility: 60,
  familyCapacity: { technical: 90, mental: 88, physical: 87, goalkeeper: 85 },
  familyPeakAge: { technical: 27, mental: 30, physical: 25, goalkeeper: 32 },
  familyDeclineStartAge: { technical: 31, mental: 35, physical: 29, goalkeeper: 36 },
  stagnationResistance: 70,
  crisisSensitivity: 35,
};

const npc = (
  id = 'npc',
  age = 18,
  position: 'striker' | 'goalkeeper' = 'striker',
): WorldFootballer => ({
  profile: generateCanonicalFootballerProfile({
    id,
    seed: id,
    age,
    targetOverall: 58,
    primaryPosition: position,
  }),
  developmentProfile: development,
  developmentCurveId: position === 'goalkeeper' ? 'goalkeeper_late_prime' : 'balanced',
  careerStatus: 'active',
  currentClubId: 'club',
});

const careerWith = (...players: WorldFootballer[]) => {
  const player = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Test',
      age: 16,
      nationality: 'PL',
      dominantFoot: 'right',
      difficulty: 'normal',
      position: 'striker',
      heightCm: 180,
      weightKg: 75,
      seed: 'career',
    },
    'career',
    0,
  );
  return {
    ...createCareerState(player, 'career'),
    currentDate: '2026-07-01',
    footballerWorld: Object.fromEntries(players.map((item) => [item.profile.id, item])),
    worldDelta: emptyWorldDelta(),
  };
};

const average = (attributes: PlayerAttributes, keys: (keyof PlayerAttributes)[]) =>
  keys.reduce((sum, key) => sum + attributes[key]!, 0) / keys.length;
const physical: (keyof PlayerAttributes)[] = ['pace', 'stamina', 'strength', 'agility', 'jumping'];
const goalkeeper: (keyof PlayerAttributes)[] = [
  'reflexes',
  'handling',
  'oneOnOnes',
  'goalkeeperSweeping',
];

describe('NPC date-based development projection', () => {
  test('is deterministic and random-access independent', () => {
    const player = npc();
    const date = '2038-07-01';
    const direct = projectNpcAttributesAtDate({ footballer: player, date, seed: 'world' });
    expect(projectNpcAttributesAtDate({ footballer: player, date, seed: 'world' })).toEqual(direct);
    for (let year = 2027; year < 2038; year++)
      projectNpcAttributesAtDate({ footballer: player, date: `${year}-07-01`, seed: 'world' });
    expect(projectNpcAttributesAtDate({ footballer: player, date, seed: 'world' })).toEqual(direct);
  });

  test('young players improve while older outfield players regress plausibly', () => {
    const young = npc('young', 18);
    expect(
      average(projectNpcAttributesAtDate({ footballer: young, date: '2032-07-01' }), physical),
    ).toBeGreaterThan(average(young.profile.attributes, physical));
    const old = npc('old', 32);
    expect(
      average(projectNpcAttributesAtDate({ footballer: old, date: '2038-07-01' }), physical),
    ).toBeLessThan(average(old.profile.attributes, physical));
  });

  test('goalkeepers retain their specialist skills later than outfield physical skills', () => {
    const keeper = npc('keeper', 32, 'goalkeeper');
    const outfield = npc('outfield', 32);
    const date = '2038-07-01';
    const keeperDelta =
      average(projectNpcAttributesAtDate({ footballer: keeper, date }), goalkeeper) -
      average(keeper.profile.attributes, goalkeeper);
    const outfieldDelta =
      average(projectNpcAttributesAtDate({ footballer: outfield, date }), physical) -
      average(outfield.profile.attributes, physical);
    expect(keeperDelta).toBeGreaterThan(outfieldDelta);
  });

  test('season processing stores no natural-development overrides', () => {
    const career = careerWith(npc('active'));
    let result: CareerState = career;
    for (let year = 2027; year <= 2052; year++)
      result = processNpcSeasonDevelopment(result, `${year}-07-01`);
    expect(result).toBe(career);
    expect(result.worldDelta?.footballerAttributeOverrides).toBeUndefined();
  });

  test('explicit exceptional overrides compose after projected development', () => {
    const player = npc('override');
    const career = careerWith(player);
    career.currentDate = '2032-07-01';
    career.worldDelta!.footballerAttributeOverrides = { override: { finishing: 99 } };
    const resolved = resolveFootballer(career, 'override')!;
    expect(resolved.attributes.finishing).toBe(99);
    expect(resolved.attributes.pace).toBe(
      projectNpcAttributesAtDate({
        footballer: player,
        date: career.currentDate,
        seed: career.seed,
      }).pace,
    );
  });
});

describe('development presentation helpers', () => {
  test('aggregates net changes and retains shared radar projection', () => {
    const attributes = npc('archive').profile.attributes;
    const end = { ...attributes, stamina: attributes.stamina + 3 };
    expect(aggregateDevelopment(attributes, end)).toContainEqual({
      attribute: 'stamina',
      before: attributes.stamina,
      after: attributes.stamina + 3,
      delta: 3,
    });
    expect(getRadarAxes(attributes)).toEqual(getRadarAxes({ ...attributes }));
  });
});
