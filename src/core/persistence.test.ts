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
import { generateProfessionalClubPool } from './professionalClubs';
import { createLeagueSeason } from './leagueSeason';

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
const career = () =>
  createCareerState(generateStartingPlayerProfile(input, 'save-seed', 0), 'save-seed');

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
  it('repairs malformed narrative variant history from a legacy save', () => {
    localStorage.setItem(
      CAREER_SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        career: { ...career(), recentVariantKeys: ['a', 'b', null, '', 12] },
      }),
    );
    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.save.career.recentVariantKeys).toEqual(['a', 'b']);
  });
  it('migrates a professional save without the canonical league tier', () => {
    const oldClub = {
      ...generateProfessionalClubPool('save-seed')[0]!,
      professionalLevel: 2,
    } as Record<string, unknown>;
    delete oldClub.leagueTier;
    const oldCareer = career() as unknown as Record<string, unknown>;
    oldCareer.currentSeason = 2028;
    oldCareer.careerSeasonNumber = 3;
    oldCareer.currentProfessionalClub = oldClub;
    oldCareer.leagueSeason = createLeagueSeason('legacy-save', {
      professional: true,
      professionalLevel: 2,
      startYear: 2028,
    });
    const league = oldCareer.leagueSeason as Record<string, unknown>;
    const competition = league.competition as Record<string, unknown>;
    delete competition.tier;
    localStorage.setItem(
      CAREER_SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        career: oldCareer,
      }),
    );

    const loaded = loadCareer();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.save.career.currentProfessionalClub?.leagueTier).toBe(2);
      expect(loaded.save.career.leagueSeason?.competition.name).toBe('Polska Liga Krajowa');
    }
  });

  it('migrates legacy match history into a complete canonical ledger idempotently on load', () => {
    const legacy = career() as unknown as Record<string, unknown>;
    const league = createLeagueSeason('legacy-ledger');
    const controlledFixture = league.rounds[0]!.fixtures.find((fixture) =>
      [fixture.homeClubId, fixture.awayClubId].includes(league.controlledClubId),
    )!;
    controlledFixture.completed = true;
    controlledFixture.homeGoals = 2;
    controlledFixture.awayGoals = 1;
    legacy.leagueSeason = league;
    delete legacy.seasonParticipation;
    legacy.matchHistory = [
      {
        matchId: controlledFixture.id,
        date: controlledFixture.date,
        opponentId:
          controlledFixture.homeClubId === league.controlledClubId
            ? controlledFixture.awayClubId
            : controlledFixture.homeClubId,
        teamLevel: 'academy',
        started: true,
        minutes: 90,
        goals: 1,
        assists: 1,
        xG: 0.8,
        xA: 0.4,
        keyPasses: 2,
        defensiveActions: 3,
        saves: 0,
        personalImpact: 3,
        rating: 7.8,
        yellowCards: 1,
      },
    ];
    localStorage.setItem(
      CAREER_SAVE_KEY,
      JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        career: legacy,
      }),
    );

    const first = loadCareer();
    const second = loadCareer();
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.save.career.seasonParticipation).toHaveLength(22);
      expect(second.save.career.seasonParticipation).toEqual(first.save.career.seasonParticipation);
      expect(new Set(first.save.career.seasonParticipation!.map((row) => row.fixtureId)).size).toBe(
        22,
      );
      expect(
        first.save.career.seasonParticipation!.find(
          (row) => row.fixtureId === controlledFixture.id,
        ),
      ).toMatchObject({
        fixtureStatus: 'completed',
        score: { home: 2, away: 1 },
        minutes: 90,
        started: true,
        goals: 1,
        assists: 1,
        yellowCards: 1,
        rating: 7.8,
      });
    }
  });
});
