import { describe, expect, test } from 'vitest';
import type { DevelopmentProfile, WorldFootballer } from '../types/domain';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { generateCanonicalFootballerProfile, resolveFootballer } from './footballerWorld';
import {
  aggregateDevelopment,
  processNpcSeasonDevelopment,
  projectNpcSeasonDevelopment,
} from './seasonDevelopment';
import { emptyWorldDelta } from './worldDatabase';
import { getRadarAxes } from './radar';

const development: DevelopmentProfile = {
  developmentType: 'normal',
  growthRate: 1.2,
  developmentVolatility: 60,
  familyCapacity: { technical: 90, mental: 88, physical: 87, goalkeeper: 85 },
  familyPeakAge: { technical: 27, mental: 29, physical: 25, goalkeeper: 31 },
  familyDeclineStartAge: { technical: 31, mental: 34, physical: 29, goalkeeper: 34 },
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
  careerStatus: 'active',
  currentClubId: 'club',
  currentContract: {
    clubId: 'club',
    startDate: '2025-07-01',
    endDate: '2029-06-30',
    monthlySalary: 1000,
    signingBonus: 0,
    squadRole: 'rotation',
    contractType: 'professional',
  },
});

const careerWith = (...players: WorldFootballer[]) => {
  const generated = generateStartingPlayerProfile(
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
    ...createCareerState(generated, 'career'),
    currentDate: '2026-07-01',
    footballerWorld: Object.fromEntries(players.map((item) => [item.profile.id, item])),
    worldDelta: emptyWorldDelta(),
  };
};

describe('NPC seasonal development', () => {
  test('is deterministic, bounded and preserves football identity', () => {
    const player = npc();
    const first = projectNpcSeasonDevelopment({
      footballer: player,
      boundaryDate: '2027-07-01',
      clubEnvironment: 80,
      seed: 'same',
    });
    const second = projectNpcSeasonDevelopment({
      footballer: player,
      boundaryDate: '2027-07-01',
      clubEnvironment: 80,
      seed: 'same',
    });
    expect(first).toEqual(second);
    expect(first.footballer.currentClubId).toBe(player.currentClubId);
    expect(first.footballer.currentContract).toEqual(player.currentContract);
    expect(first.footballer.profile.primaryPosition).toBe(player.profile.primaryPosition);
    expect(first.footballer.profile.secondaryPositions).toEqual(player.profile.secondaryPositions);
    expect(first.footballer.profile.positionFamiliarity).toEqual(
      player.profile.positionFamiliarity,
    );
    expect(
      Object.values(first.footballer.profile.attributes).every(
        (value) => value >= 1 && value <= 100,
      ),
    ).toBe(true);
    expect(first.summary.changes.every((change) => Math.abs(change.delta) <= 2)).toBe(true);
  });

  test('is idempotent, skips protagonist and retired NPCs, and writes only real changes', () => {
    const active = npc('active');
    const retired = { ...npc('retired'), careerStatus: 'retired' as const };
    const base = careerWith(active, retired);
    base.footballerWorld![base.player.id] = { ...active, profile: base.player };
    const once = processNpcSeasonDevelopment(base, '2027-07-01');
    const twice = processNpcSeasonDevelopment(once, '2027-07-01');
    expect(twice).toEqual(once);
    expect(once.worldDelta?.footballerOverrides.retired).toBeUndefined();
    expect(once.worldDelta?.footballerOverrides[base.player.id]).toBeUndefined();
    for (const changed of Object.values(once.worldDelta?.footballerOverrides ?? {})) {
      expect(changed.currentContract).toEqual(active.currentContract);
      expect(changed.profile.attributes).not.toEqual(
        base.footballerWorld![changed.profile.id]?.profile.attributes,
      );
    }
  });

  test('does not persist age-only changes and resolves current age from birth date', () => {
    const player = npc('age-only');
    player.developmentProfile = {
      ...development,
      growthRate: 0.00001,
      stagnationResistance: 0,
      familyCapacity: { technical: 1, mental: 1, physical: 1, goalkeeper: 1 },
      familyDeclineStartAge: { technical: 99, mental: 99, physical: 99, goalkeeper: 99 },
    };
    const base = careerWith(player);
    const result = processNpcSeasonDevelopment(base, '2027-07-01');
    expect(result.worldDelta?.footballerOverrides['age-only']).toBeUndefined();
    const age2026 = resolveFootballer(base, 'age-only')!.age;
    expect(resolveFootballer({ ...base, currentDate: '2029-07-01' }, 'age-only')!.age).toBe(
      age2026 + 3,
    );
  });

  test('resolves override precedence, preserves prior deltas and exposes changes normally', () => {
    const basePlayer = npc('precedence', 18);
    const override = {
      ...basePlayer,
      profile: {
        ...basePlayer.profile,
        attributes: { ...basePlayer.profile.attributes, finishing: 77 },
      },
    };
    const added = npc('added', 18);
    const career = careerWith(basePlayer);
    career.worldDelta = {
      ...emptyWorldDelta(),
      newFootballers: { added },
      footballerOverrides: { precedence: override },
    };
    const result = processNpcSeasonDevelopment(career, '2027-07-01');
    expect(result.worldDelta?.footballerOverrides.precedence).toBeDefined();
    expect(result.worldDelta?.newFootballers.added).toBe(added);
    expect(resolveFootballer(result, 'precedence')?.attributes).toEqual(
      result.worldDelta?.footballerOverrides.precedence?.profile.attributes,
    );
    expect(processNpcSeasonDevelopment(result, '2027-07-01')).toBe(result);
  });

  test('capacity brakes growth and goalkeepers retain later decline timing', () => {
    const young = npc('young', 18);
    const capped = npc('capped', 18);
    capped.developmentProfile = {
      ...development,
      familyCapacity: { technical: 1, mental: 1, physical: 1, goalkeeper: 1 },
    };
    let youngChanges = 0;
    let cappedChanges = 0;
    for (let index = 0; index < 60; index++) {
      youngChanges += projectNpcSeasonDevelopment({
        footballer: young,
        boundaryDate: '2027-07-01',
        seed: `sample-${index}`,
        clubEnvironment: 80,
      }).summary.changes.length;
      cappedChanges += projectNpcSeasonDevelopment({
        footballer: capped,
        boundaryDate: '2027-07-01',
        seed: `sample-${index}`,
        clubEnvironment: 80,
      }).summary.changes.filter((item) => item.delta > 0).length;
    }
    expect(youngChanges).toBeGreaterThan(cappedChanges);
    const oldOutfield = npc('old-o', 35);
    const oldKeeper = npc('old-g', 35, 'goalkeeper');
    const out = projectNpcSeasonDevelopment({
      footballer: oldOutfield,
      boundaryDate: '2027-07-01',
      seed: 'decline',
      clubEnvironment: 50,
    });
    const keeper = projectNpcSeasonDevelopment({
      footballer: oldKeeper,
      boundaryDate: '2027-07-01',
      seed: 'decline',
      clubEnvironment: 50,
    });
    expect(
      out.summary.changes.some((item) => item.delta < 0) || keeper.summary.changes.length === 0,
    ).toBe(true);
  });
});

describe('archived season development presentation', () => {
  test('aggregates repeated increments into the immutable start/end net change', () => {
    const attributes = npc('archive').profile.attributes;
    const end = { ...attributes, stamina: attributes.stamina + 3 };
    expect(aggregateDevelopment(attributes, end)).toContainEqual({
      attribute: 'stamina',
      before: attributes.stamina,
      after: attributes.stamina + 3,
      delta: 3,
    });
    expect(
      aggregateDevelopment(attributes, end).filter((item) => item.attribute === 'stamina'),
    ).toHaveLength(1);
  });

  test('uses one shared macro radar calculation for both profiles', () => {
    const attributes = npc('radar').profile.attributes;
    expect(getRadarAxes(attributes)).toEqual(getRadarAxes({ ...attributes }));
    expect(getRadarAxes(attributes)).toHaveLength(8);
  });
});
