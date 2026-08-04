// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { CAREER_SAVE_KEY, deleteCareer, hasValidCareer, loadCareer, saveCareer } from './persistence';
import { createCareerState, generateStartingPlayerProfile, type CreatorInput } from './playerCreator';

const input: CreatorInput = { firstName: 'Jan', lastName: 'Nowak', nationality: 'PL', age: 17, dominantFoot: 'right', customSeed: '', seed: 'save-seed', position: 'central_midfielder', heightCm: 179, weightKg: 73 };
const career = () => createCareerState(generateStartingPlayerProfile(input, 'save-seed', 0), 'save-seed');

describe('career persistence', () => {
  beforeEach(() => localStorage.clear());
  it('saves and loads a valid localStorage career', () => {
    saveCareer(career());
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    expect(hasValidCareer()).toBe(true);
    if (loaded.ok) expect(loaded.save.career.seed).toBe('save-seed');
  });
  it('deletes a career', () => {
    saveCareer(career()); deleteCareer();
    expect(loadCareer()).toEqual({ ok: false, reason: 'missing' });
  });
  it('rejects corrupted JSON', () => {
    localStorage.setItem(CAREER_SAVE_KEY, '{bad');
    expect(loadCareer()).toEqual({ ok: false, reason: 'invalid_json' });
  });
  it('rejects incompatible versions', () => {
    localStorage.setItem(CAREER_SAVE_KEY, JSON.stringify({ version: 99, savedAt: new Date().toISOString(), career: {} }));
    expect(loadCareer()).toEqual({ ok: false, reason: 'incompatible_version' });
  });
});
