// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAREER_SAVE_KEY,
  deleteCareer,
  hasValidCareer,
  loadCareer,
  saveCareer,
} from './persistence';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import { cacheWorldDatabase, WORLD_DATABASE_SEED, WORLD_DATABASE_VERSION } from './worldDatabase';
import { processYouthGraduation } from './youthGraduation';

const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Nowak',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  seed: 'save-seed',
  position: 'attacking_midfielder',
  heightCm: 179,
  weightKg: 73,
};
const career = () =>
  createCareerState(generateStartingPlayerProfile(input, 'save-seed', 0), 'save-seed');

describe('career persistence', () => {
  beforeEach(() => localStorage.clear());
  it('saves and loads a valid localStorage career', () => {
    const state = career();
    cacheWorldDatabase({
      version: WORLD_DATABASE_VERSION,
      startingSeason: 2026,
      seed: WORLD_DATABASE_SEED,
      clubs: state.clubWorld!,
      footballers: state.footballerWorld!,
      youthCohorts: state.youthCohorts!,
    });
    const saved = saveCareer(state);
    expect('youthCohorts' in saved.career).toBe(false);
    expect(JSON.parse(localStorage.getItem(CAREER_SAVE_KEY)!).career.youthCohorts).toBeUndefined();
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    expect(hasValidCareer()).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.career.seed).toBe('save-seed');
      expect(loaded.save.career.youthCohorts).toEqual(state.youthCohorts);
    }
  });
  it('deterministically migrates and persists a legacy player birthday', () => {
    const state = career();
    cacheWorldDatabase({
      version: WORLD_DATABASE_VERSION,
      startingSeason: 2026,
      seed: WORLD_DATABASE_SEED,
      clubs: state.clubWorld!,
      footballers: state.footballerWorld!,
      youthCohorts: state.youthCohorts!,
    });
    const legacy = structuredClone(saveCareer(state));
    delete legacy.career.player.dateOfBirth;
    localStorage.setItem(CAREER_SAVE_KEY, JSON.stringify(legacy));
    const first = loadCareer();
    const second = loadCareer();
    expect(first).toEqual(second);
    expect(first.ok && first.save.career.player.dateOfBirth).toBeTruthy();
    if (first.ok) {
      saveCareer(first.save.career);
      const roundTrip = loadCareer();
      expect(roundTrip.ok && roundTrip.save.career.player.dateOfBirth).toBe(
        first.save.career.player.dateOfBirth,
      );
    }
  });
  it('persists graduation deltas while rehydrating immutable youth data', () => {
    const base = career();
    cacheWorldDatabase({
      version: WORLD_DATABASE_VERSION,
      startingSeason: 2026,
      seed: WORLD_DATABASE_SEED,
      clubs: base.clubWorld!,
      footballers: base.footballerWorld!,
      youthCohorts: base.youthCohorts!,
    });
    const graduated = processYouthGraduation(base).career;
    saveCareer(graduated);
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.career.youthCohorts).toEqual(base.youthCohorts);
      expect(loaded.save.career.worldDelta).toEqual(graduated.worldDelta);
    }
  });
  it('deletes a career', () => {
    saveCareer(career());
    deleteCareer();
    expect(loadCareer()).toEqual({ ok: false, reason: 'missing' });
  });
  it('rejects corrupted JSON', () => {
    localStorage.setItem(CAREER_SAVE_KEY, '{bad');
    expect(loadCareer()).toEqual({ ok: false, reason: 'invalid_json' });
  });
  it('rejects incompatible versions', () => {
    localStorage.setItem(
      CAREER_SAVE_KEY,
      JSON.stringify({ version: 99, savedAt: new Date().toISOString(), career: {} }),
    );
    expect(loadCareer()).toEqual({ ok: false, reason: 'incompatible_version' });
  });
  it('intentionally rejects prototype-era version 1 saves', () => {
    localStorage.setItem(
      CAREER_SAVE_KEY,
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), career: career() }),
    );
    expect(loadCareer()).toEqual({ ok: false, reason: 'incompatible_version' });
  });
});
