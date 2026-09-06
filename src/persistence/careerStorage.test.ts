// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import { CAREER_SAVE_KEY, serializeCurrentCareerSave } from '../core/persistence';
import { CareerStorage } from './careerStorage';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Nowak',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        customSeed: '',
        seed: 'storage-seed',
        position: 'central_midfielder',
        heightCm: 179,
        weightKg: 73,
      },
      'storage-seed',
      0,
    ),
    'storage-seed',
  );

describe('career storage degraded mode', () => {
  beforeEach(() => localStorage.clear());

  it('reports no save when IndexedDB is unavailable', async () => {
    const storage = new CareerStorage(undefined, localStorage);
    expect(await storage.load()).toEqual({
      ok: false,
      reason: 'missing',
      mode: 'legacy-localstorage-fallback',
    });
  });

  it('round-trips, overwrites and deletes through the explicit fallback', async () => {
    const storage = new CareerStorage(undefined, localStorage);
    const first = career();
    await storage.save(serializeCurrentCareerSave(first));
    expect((await storage.load()).ok).toBe(true);

    const newer = { ...first, currentSeason: first.currentSeason + 1 };
    const serialized = serializeCurrentCareerSave(newer);
    await storage.save(serialized);
    expect(localStorage.getItem(CAREER_SAVE_KEY)).toBe(serialized);
    expect(storage.getDiagnostics()).toMatchObject({
      backend: 'legacy-localstorage-fallback',
      schemaVersion: 7,
    });

    await storage.delete();
    expect(await storage.exists()).toBe(false);
  });

  it('serializes overlapping writes in invocation order', async () => {
    const storage = new CareerStorage(undefined, localStorage);
    const first = serializeCurrentCareerSave(career());
    const latest = serializeCurrentCareerSave({ ...career(), currentSeason: 2027 });
    await Promise.all([storage.save(first), storage.save(latest)]);
    expect(localStorage.getItem(CAREER_SAVE_KEY)).toBe(latest);
  });
});
