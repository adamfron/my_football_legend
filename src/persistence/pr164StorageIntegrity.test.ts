// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CareerStorage } from './careerStorage';
import { createCareerState, generateStartingPlayerProfile } from '../core/playerCreator';
import { CAREER_SAVE_KEY, serializeCurrentCareerSave } from '../core/persistence';

const payload = (season = 2026) =>
  serializeCurrentCareerSave({
    ...createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Zapis',
          age: 16,
          nationality: 'PL',
          dominantFoot: 'right',
          position: 'striker',
          heightCm: 180,
          weightKg: 75,
          seed: 'pr164-storage',
        },
        'pr164-storage',
        0,
      ),
      'pr164-storage',
    ),
    currentSeason: season,
  });
/** Transaction fault double: writes become visible only at commit. Real-browser timings are separate. */
const atomicDatabase = () => {
  const data = new Map<string, string>();
  const faults = {
    open: false,
    write: undefined as string | undefined,
    read: false,
    verification: false,
    commits: 0,
  };
  const database = {
    objectStoreNames: { contains: () => true },
    transaction: () => {
      const transaction = {
        error: null as Error | null,
        oncomplete: undefined as (() => void) | undefined,
        onabort: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
        objectStore: () => ({
          get: () => {
            const request = {
              result: undefined as unknown,
              error: null as Error | null,
              onsuccess: undefined as (() => void) | undefined,
              onerror: undefined as (() => void) | undefined,
            };
            setTimeout(() => {
              if (faults.read) {
                request.error = new Error('read failed');
                transaction.error = request.error;
                request.onerror?.();
                transaction.onabort?.();
              } else {
                request.result =
                  faults.verification && data.has('primary') ? 'incomplete' : data.get('primary');
                request.onsuccess?.();
                transaction.oncomplete?.();
              }
            }, 0);
            return request;
          },
          put: (value: string) =>
            setTimeout(() => {
              if (faults.write) {
                transaction.error = new DOMException('Injected aborted write', faults.write);
                transaction.onabort?.();
              } else {
                data.set('primary', value);
                faults.commits++;
                transaction.oncomplete?.();
              }
            }, 0),
          delete: () =>
            setTimeout(() => {
              data.delete('primary');
              transaction.oncomplete?.();
            }, 0),
        }),
      };
      return transaction;
    },
  };
  const factory = {
    open: () => {
      const request = {
        result: database,
        error: null as Error | null,
        onsuccess: undefined as (() => void) | undefined,
        onerror: undefined as (() => void) | undefined,
      };
      setTimeout(() => {
        if (faults.open) {
          request.error = new Error('unavailable');
          request.onerror?.();
        } else request.onsuccess?.();
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, data, faults };
};
const legacy = () => {
  const values = new Map<string, string>();
  return {
    values,
    storage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    } as unknown as Storage,
  };
};

describe('PR164 storage failure and migration integrity', () => {
  it('verifies legacy migration before removal and serializes repeated migration/overlapping save', async () => {
    const db = atomicDatabase(),
      old = legacy(),
      first = payload(),
      newer = payload(2027);
    old.values.set(CAREER_SAVE_KEY, first);
    const storage = new CareerStorage(db.factory, old.storage);
    const [a, b] = await Promise.all([storage.load(), storage.load(), storage.save(newer)]);
    expect(a.ok && b.ok).toBe(true);
    expect(old.values.has(CAREER_SAVE_KEY)).toBe(false);
    expect(db.faults.commits).toBe(2);
    expect(db.data.get('primary')).toBe(newer);
    expect((await storage.load()).ok).toBe(true);
  });
  it.each(['QuotaExceededError', 'AbortError'])(
    'preserves the last good save when a %s write is interrupted',
    async (name) => {
      const db = atomicDatabase(),
        storage = new CareerStorage(db.factory, legacy().storage),
        first = payload();
      await storage.save(first);
      db.faults.write = name;
      await expect(storage.save(payload(2027))).rejects.toMatchObject({
        kind: name === 'QuotaExceededError' ? 'quota_exceeded' : 'storage_failure',
      });
      expect(db.data.get('primary')).toBe(first);
      expect((await storage.load()).ok).toBe(true);
      db.faults.write = undefined;
      const newest = payload(2028);
      await storage.save(newest);
      expect(db.data.get('primary')).toBe(newest);
    },
  );
  it('retains legacy data after failed migration and failed read-back verification', async () => {
    const db = atomicDatabase(),
      old = legacy();
    old.values.set(CAREER_SAVE_KEY, payload());
    const storage = new CareerStorage(db.factory, old.storage);
    db.faults.write = 'AbortError';
    expect(await storage.load()).toMatchObject({ ok: false, reason: 'transaction_failure' });
    expect(old.values.has(CAREER_SAVE_KEY)).toBe(true);
    db.faults.write = undefined;
    db.faults.verification = true;
    expect(await storage.load()).toMatchObject({ ok: false, reason: 'transaction_failure' });
    expect(old.values.has(CAREER_SAVE_KEY)).toBe(true);
  });
  it('does not silently replace invalid legacy or an incomplete primary commit', async () => {
    const db = atomicDatabase(),
      old = legacy();
    old.values.set(CAREER_SAVE_KEY, '{broken');
    const storage = new CareerStorage(db.factory, old.storage);
    expect((await storage.load()).ok).toBe(false);
    expect(old.values.get(CAREER_SAVE_KEY)).toBe('{broken');
    expect(db.faults.commits).toBe(0);
    db.data.set('primary', '{"version":7}');
    old.values.set(CAREER_SAVE_KEY, payload());
    expect((await storage.load()).ok).toBe(false);
    expect(db.data.get('primary')).toBe('{"version":7}');
    expect(old.values.has(CAREER_SAVE_KEY)).toBe(true);
  });
  it('normalizes an older valid save once and preserves condition across round-trip', async () => {
    const db = atomicDatabase(),
      old = legacy(),
      parsed = JSON.parse(payload());
    parsed.version = 6;
    parsed.career.worldDelta.footballerConditionOverrides = {
      npc: {
        capacity: 65,
        lastUpdatedDate: '2026-07-01',
        source: 'canonical',
        lastMatchId: 'fixture:once',
      },
    };
    old.values.set(CAREER_SAVE_KEY, JSON.stringify(parsed));
    const storage = new CareerStorage(db.factory, old.storage);
    const loaded = await storage.load();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.version).toBe(7);
    expect(loaded.save.career.worldDelta?.footballerConditionOverrides?.npc?.capacity).toBe(65);
    await storage.save(serializeCurrentCareerSave(loaded.save.career));
    const again = await storage.load();
    expect(again.ok).toBe(true);
    if (again.ok)
      expect(again.save.career.worldDelta?.footballerConditionOverrides?.npc?.lastMatchId).toBe(
        'fixture:once',
      );
  });
  it('reports denied fallback reads, quota, unavailable storage and transaction read failures', async () => {
    const denied = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as Storage;
    expect(await new CareerStorage(undefined, denied).load()).toMatchObject({
      ok: false,
      reason: 'transaction_failure',
    });
    const quota = {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    } as unknown as Storage;
    await expect(new CareerStorage(undefined, quota).save(payload())).rejects.toMatchObject({
      kind: 'quota_exceeded',
    });
    await expect(new CareerStorage(undefined, null).save(payload())).rejects.toMatchObject({
      kind: 'storage_failure',
    });
    const db = atomicDatabase();
    db.faults.read = true;
    expect(await new CareerStorage(db.factory, legacy().storage).load()).toMatchObject({
      ok: false,
      reason: 'transaction_failure',
    });
    db.faults.open = true;
    const old = legacy();
    old.values.set(CAREER_SAVE_KEY, payload());
    expect(await new CareerStorage(db.factory, old.storage).load()).toMatchObject({
      ok: true,
      mode: 'legacy-localstorage-fallback',
    });
  });
});
