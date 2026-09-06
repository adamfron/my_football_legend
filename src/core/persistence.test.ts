import { resolveEffectiveSeniorSquad } from './worldDatabase';
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CAREER_SAVE_KEY,
  deleteCareer,
  hasValidCareer,
  loadCareer,
  hydrateCareerWithWorld,
  saveCareer,
  serializeCareerSave,
  migrateLegacyMidfieldPositions,
  CareerPersistenceError,
  migrateV6WorldDelta,
} from './persistence';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import {
  cacheWorldDatabase,
  clearWorldDatabaseCache,
  WORLD_DATABASE_SEED,
  WORLD_DATABASE_VERSION,
  resolveCareerWorldFootballer,
} from './worldDatabase';
import { advanceCareerFlow } from './careerFlow';
import { acceptProfessionalOffer } from './careerSeasons';
import { careerStateSchema } from '../schemas/domainSchemas';
import { processYouthGraduation } from './youthGraduation';
import { processYouthIntake } from './youthIntake';

describe('v6 to v7 world normalization', () => {
  it('uses player state over squads, retirement over both, and drops procedural cards', () => {
    const proceduralId = 'footballer_proc_v2_emergency_pro_0_2027_goalkeeper_0';
    const migrated = migrateV6WorldDelta({
      squadOverrides: { old: ['moved', 'retired'], conflicting: ['moved'] },
      footballerStateOverrides: {
        moved: { currentClubId: 'winner', careerStatus: 'active' },
        retired: { currentClubId: 'old', careerStatus: 'retired' },
      },
      retiredFootballerIds: ['retired'],
      newFootballers: { [proceduralId]: {} },
    });
    expect(migrated.npcClubMembership).toEqual({ moved: 'winner' });
    expect(migrated.footballerStateOverrides).toEqual({});
    expect(migrated.newFootballers).toEqual({});
    expect(migrated.squadOverrides).toBeUndefined();
  });
});

const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Nowak',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  seed: 'save-seed',
  position: 'central_midfielder',
  heightCm: 179,
  weightKg: 73,
};

describe('legacy midfield migration', () => {
  it('merges primary, secondary and familiarity values at the versioned boundary', () => {
    const migrated = migrateLegacyMidfieldPositions({
      primaryPosition: 'defensive_midfielder',
      secondaryPositions: ['attacking_midfielder', 'defensive_midfielder', 'striker'],
      positionFamiliarity: { defensive_midfielder: 0.6, attacking_midfielder: 0.85, striker: 1 },
    }) as Record<string, unknown>;
    expect(migrated.primaryPosition).toBe('central_midfielder');
    expect(migrated.secondaryPositions).toEqual(['central_midfielder', 'striker']);
    expect(migrated.positionFamiliarity).toEqual({ central_midfielder: 0.85, striker: 1 });
  });
  it('maps retired midfield archetypes to canonical profiles', () => {
    const mappings = {
      classic_creator: 'playmaker',
      regista: 'playmaker',
      dribbling_creator: 'mezzala',
      carillero: 'box_to_box',
      ball_winner: 'defensive_midfielder',
      half_back: 'defensive_midfielder',
      withdrawn_forward: 'raumdeuter',
    };
    for (const [legacy, canonical] of Object.entries(mappings))
      expect(migrateLegacyMidfieldPositions({ footballArchetypeId: legacy })).toEqual({
        footballArchetypeId: canonical,
      });
  });
});
const career = () =>
  createCareerState(generateStartingPlayerProfile(input, 'save-seed', 0), 'save-seed');

describe('career persistence', () => {
  beforeEach(() => localStorage.clear());
  it('saves and loads a valid localStorage career', () => {
    const state = career();
    state.seasonBaselineOverall = { [state.player.id]: 62 };
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
      expect(loaded.save.career.seasonBaselineOverall).toEqual({ [state.player.id]: 62 });
      expect(loaded.save.career.youthCohorts).toBeUndefined();
      expect(
        hydrateCareerWithWorld(loaded.save.career, {
          version: WORLD_DATABASE_VERSION,
          startingSeason: 2026,
          seed: WORLD_DATABASE_SEED,
          clubs: state.clubWorld!,
          footballers: state.footballerWorld!,
          youthCohorts: state.youthCohorts!,
        }).youthCohorts,
      ).toEqual(state.youthCohorts);
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
      expect(loaded.save.career.youthCohorts).toBeUndefined();
      expect(loaded.save.career.worldDelta).toEqual(graduated.worldDelta);
    }
  });
  it('cold-resolves procedural youth identically without persisting a full card', () => {
    const base = career();
    const world = {
      version: WORLD_DATABASE_VERSION,
      startingSeason: 2026 as const,
      seed: WORLD_DATABASE_SEED,
      clubs: base.clubWorld!,
      footballers: base.footballerWorld!,
      youthCohorts: base.youthCohorts!,
    };
    const generated = processYouthIntake(processYouthGraduation(base).career);
    const id = Object.values(generated.worldDelta!.youthCohortOverrides!)
      .flat()
      .find((candidate) => !generated.footballerWorld![candidate])!;
    const before = resolveCareerWorldFootballer(generated, id);
    saveCareer(generated);
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
    expect(resolveCareerWorldFootballer(hydrated, id)).toEqual(before);
    expect(hydrated.worldDelta!.newFootballers[id]).toBeUndefined();
    expect(hydrated.worldDelta!.footballerOverrides[id]).toBeUndefined();
  });
  it('cold-resumes a completed academy season before accepting a professional offer', () => {
    const base = advanceCareerFlow(career());
    const world = {
      version: WORLD_DATABASE_VERSION,
      startingSeason: 2026 as const,
      seed: WORLD_DATABASE_SEED,
      clubs: base.clubWorld!,
      footballers: base.footballerWorld!,
      youthCohorts: base.youthCohorts!,
    };
    const completed = advanceCareerFlow({
      ...base,
      currentDate: '2027-06-30',
      leagueSeason: { ...base.leagueSeason!, completed: true },
      seasonOutcome: { finalPosition: 5, champion: false, competitionType: 'academy' as const },
    });
    saveCareer(completed);
    clearWorldDatabaseCache();
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.save.career.clubWorld).toBeUndefined();
    const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
    const offer = hydrated.professionalOffers![0]!;
    const next = acceptProfessionalOffer(hydrated, offer.id);
    expect(next.careerSeasonNumber).toBe(2);
    expect(next.leagueSeason).toMatchObject({
      completed: false,
      competition: { category: 'professional' },
    });
    const occurrences = next.clubWorld!.reduce((count, club) => {
      const squad = resolveEffectiveSeniorSquad(next, club.id);
      return count + squad.filter((id) => id === next.player.id).length;
    }, 0);
    expect(occurrences).toBe(1);
    expect(next.footballerWorld).toStrictEqual(world.footballers);
    expect(careerStateSchema.safeParse(next).success).toBe(true);
    const serialized = serializeCareerSave(next);
    const metrics = {
      bytes: new TextEncoder().encode(serialized).byteLength,
      footballerOverrides: Object.keys(next.worldDelta?.footballerOverrides ?? {}).length,
      stateOverrides: Object.keys(next.worldDelta?.footballerStateOverrides ?? {}).length,
      attributeOverrides: Object.keys(next.worldDelta?.footballerAttributeOverrides ?? {}).length,
      newFootballers: Object.keys(next.worldDelta?.newFootballers ?? {}).length,
      npcClubMembership: Object.keys(next.worldDelta?.npcClubMembership ?? {}).length,
      npcTransfers: next.worldDelta?.npcTransferRecords?.length ?? 0,
    };
    console.info('academy-to-professional save metrics', metrics);
    // Full overrides here belong to graduation/contracts; natural development stores no patches.
    expect(metrics.footballerOverrides).toBeLessThan(300);
    expect(metrics.attributeOverrides).toBe(0);
    expect(metrics.bytes).toBeLessThan(1_500_000);
    expect(serialized).not.toContain('"clubWorld"');
    expect(serialized).not.toContain('"footballerWorld"');
    expect(serialized).not.toContain('"youthCohorts"');
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
  it('distinguishes validation and browser quota failures', () => {
    expect(() => saveCareer({ ...career(), historyFacts: null } as never)).toThrowError(
      expect.objectContaining<Partial<CareerPersistenceError>>({ kind: 'validation_failure' }),
    );
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      const error = new Error('full');
      error.name = 'QuotaExceededError';
      throw error;
    };
    try {
      expect(() => saveCareer(career())).toThrowError(
        expect.objectContaining<Partial<CareerPersistenceError>>({ kind: 'quota_exceeded' }),
      );
    } finally {
      Storage.prototype.setItem = original;
    }
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
