import { describe, expect, it, vi } from 'vitest';
import { attributeKeys, canReroll, createCareerState, generateStartingPlayerProfile, getAllowedWeightRange, identityInputSchema, MAX_PROFILE_VARIANTS, profileInputSchema, STARTING_AGE, type CreatorInput } from './playerCreator';
import { careerStateSchema } from '../schemas/domainSchemas';

const base: CreatorInput = { firstName: 'Jan', lastName: 'Nowak', nationality: 'PL', age: STARTING_AGE, dominantFoot: 'right', customSeed: '', seed: 'test-seed', position: 'winger', heightCm: 174, weightKg: 68 };

describe('player creator', () => {
  it('generates deterministic profiles for same input and roll', () => {
    expect(generateStartingPlayerProfile(base, 'seed', 0)).toEqual(generateStartingPlayerProfile(base, 'seed', 0));
  });
  it('generates deterministic profiles for every allowed variant', () => {
    for (let index = 0; index < MAX_PROFILE_VARIANTS; index += 1) expect(generateStartingPlayerProfile(base, 'seed', index)).toEqual(generateStartingPlayerProfile(base, 'seed', index));
  });
  it('generates different attributes for consecutive rollIndex values', () => {
    expect(generateStartingPlayerProfile(base, 'seed', 0).player.attributes).not.toEqual(generateStartingPlayerProfile(base, 'seed', 1).player.attributes);
  });
  it('always starts a standard player at age 16', () => {
    expect(identityInputSchema.parse({ ...base, age: STARTING_AGE }).age).toBe(16);
    expect(generateStartingPlayerProfile({ ...base, age: 16 }, 'seed', 0).player.age).toBe(16);
  });
  it('rejects non-standard starting age', () => {
    expect(identityInputSchema.safeParse({ ...base, age: 17 }).success).toBe(false);
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
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('Math.random must not be used'); });
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
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('Podaj imię zawodnika.');
  });
  it('rejects empty height without throwing', () => {
    const result = profileInputSchema.safeParse({ position: 'winger', heightCm: '', weightKg: '68' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('Podaj wzrost zawodnika.');
  });
  it('rejects empty weight without throwing', () => {
    const result = profileInputSchema.safeParse({ position: 'winger', heightCm: '174', weightKg: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toContain('Podaj masę ciała zawodnika.');
  });
  it('rejects non-numeric and out-of-range body values', () => {
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: 'abc', weightKg: '68' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '154', weightKg: '68' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '206', weightKg: '68' }).success).toBe(false);
  });
  it('calculates allowed weight range from height', () => {
    expect(getAllowedWeightRange(155)).toEqual({ min: 45, max: 72 });
    expect(getAllowedWeightRange(205)).toEqual({ min: 76, max: 120 });
  });
  it('validates weight against height', () => {
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '155', weightKg: '80' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '155', weightKg: '72' }).success).toBe(true);
  });
  it('allows Backspace-style empty fields followed by valid numbers', () => {
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '', weightKg: '' }).success).toBe(false);
    expect(profileInputSchema.safeParse({ position: 'winger', heightCm: '174', weightKg: '68' }).success).toBe(true);
  });
  it('allows only three generated variants and selecting an earlier one', () => {
    const variants = Array.from({ length: MAX_PROFILE_VARIANTS }, (_, index) => generateStartingPlayerProfile(base, 'seed', index));
    expect(variants).toHaveLength(3);
    expect(canReroll(0)).toBe(true); expect(canReroll(1)).toBe(true); expect(canReroll(2)).toBe(false);
    expect(variants[0]).toEqual(generateStartingPlayerProfile(base, 'seed', 0));
  });
  it('clears old variants conceptually when player data changes', () => {
    const oldVariant = generateStartingPlayerProfile(base, 'seed', 0);
    const newVariant = generateStartingPlayerProfile({ ...base, position: 'striker', heightCm: 183, weightKg: 78 }, 'seed', 0);
    expect(newVariant.player.primaryPosition).toBe('striker');
    expect(newVariant.player.attributes).not.toEqual(oldVariant.player.attributes);
  });
  it('creates a valid CareerState with initial history fact', () => {
    const state = createCareerState(generateStartingPlayerProfile(base, 'seed', 0), 'seed');
    expect(careerStateSchema.safeParse(state).success).toBe(true);
    expect(state.historyFacts[0]).toMatchObject({ factType: 'career_started', season: 2026, clubs: ['club_vistula_nova'] });
  });
});
