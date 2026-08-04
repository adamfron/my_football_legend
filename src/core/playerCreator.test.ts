import { describe, expect, it, vi } from 'vitest';
import { attributeKeys, canReroll, createCareerState, generateStartingPlayerProfile, identityInputSchema, type CreatorInput } from './playerCreator';
import { careerStateSchema } from '../schemas/domainSchemas';

const base: CreatorInput = { firstName: 'Jan', lastName: 'Nowak', nationality: 'PL', age: 17, dominantFoot: 'right', customSeed: '', seed: 'test-seed', position: 'winger', heightCm: 174, weightKg: 68 };

describe('player creator', () => {
  it('generates deterministic profiles for same input and roll', () => {
    expect(generateStartingPlayerProfile(base, 'seed', 0)).toEqual(generateStartingPlayerProfile(base, 'seed', 0));
  });
  it('generates different attributes for consecutive rollIndex values', () => {
    expect(generateStartingPlayerProfile(base, 'seed', 0).player.attributes).not.toEqual(generateStartingPlayerProfile(base, 'seed', 1).player.attributes);
  });
  it('keeps academy attributes in a reasonable range', () => {
    const attributes = generateStartingPlayerProfile(base, 'seed', 0).player.attributes;
    for (const key of attributeKeys) {
      expect(attributes[key]).toBeGreaterThanOrEqual(24);
      expect(attributes[key]).toBeLessThanOrEqual(66);
    }
  });
  it('applies position bias without fixed classes', () => {
    const winger = generateStartingPlayerProfile({ ...base, position: 'winger' }, 'bias', 0).player.attributes;
    const striker = generateStartingPlayerProfile({ ...base, position: 'striker' }, 'bias', 0).player.attributes;
    expect(winger.pace + winger.technique).toBeGreaterThan(winger.defending + winger.finishing - 12);
    expect(striker.finishing).toBeGreaterThan(striker.defending);
  });
  it('does not use Math.random in profile generation', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used');
    });

    try {
      expect(() => generateStartingPlayerProfile(base, 'seed', 0)).not.toThrow();
      expect(randomSpy).not.toHaveBeenCalled();
    } finally {
      randomSpy.mockRestore();
    }
  });
  it('validates identity form data with Polish errors', () => {
    const result = identityInputSchema.safeParse({ ...base, firstName: 'J', age: 20 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((issue) => issue.message);
      expect(messages).toContain('Podaj imię zawodnika.');
      expect(messages).toContain('Maksymalny wiek startowy to 18 lat.');
    }
  });
  it('creates a valid CareerState with initial history fact', () => {
    const state = createCareerState(generateStartingPlayerProfile(base, 'seed', 0), 'seed');
    expect(careerStateSchema.safeParse(state).success).toBe(true);
    expect(state.historyFacts[0]).toMatchObject({ factType: 'career_started', season: 2026, clubs: ['club_vistula_nova'] });
  });
  it('allows only two rerolls after the first roll', () => {
    expect(canReroll(0)).toBe(true); expect(canReroll(1)).toBe(true); expect(canReroll(2)).toBe(false);
  });
});
