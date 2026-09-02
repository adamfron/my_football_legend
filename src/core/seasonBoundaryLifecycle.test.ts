import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { acceptProfessionalOffer } from './careerSeasons';
import { generateProfessionalOffers, generateSummerWindowOffers } from './professionalClubs';
import { getProfileAge } from './age';
import { processYouthGraduation } from './youthGraduation';
import { processYouthIntake } from './youthIntake';
import { processNpcRetirements, projectNpcRetirement } from './npcRetirement';

const createCareer = (seed: string) =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Granica',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 181,
        weightKg: 75,
        seed,
      },
      seed,
      0,
    ),
    seed,
  );

const completedProfessionalSeason = (seed: string) => {
  const academy = createCareer(seed);
  academy.professionalOffers = generateProfessionalOffers(academy);
  const professional = acceptProfessionalOffer(academy, academy.professionalOffers[0]!.id);
  return {
    ...professional,
    currentDate: `${professional.currentSeason + 1}-06-30`,
    leagueSeason: { ...professional.leagueSeason!, completed: true },
    seasonOutcome: {
      finalPosition: 8,
      champion: false,
      competitionType: 'professional' as const,
      previousLeagueTier: professional.currentProfessionalClub!.leagueTier,
      nextLeagueTier: professional.currentProfessionalClub!.leagueTier,
      leagueOutcome: 'stayed' as const,
    },
    seasonParticipation: professional.seasonParticipation!.map((record) => ({
      ...record,
      status: 'starter' as const,
      minutes: 90,
      plannedMinutes: 90,
      started: true,
      fixtureStatus: 'completed' as const,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
      yellowCards: 0,
      rating: 6.8,
    })),
  };
};

describe('completed professional season offer regression', () => {
  it.each(['renewal', 'external'] as const)('accepts a %s and advances exactly once', (kind) => {
    const completed = completedProfessionalSeason(`offer-${kind}`);
    const offers = generateSummerWindowOffers(completed);
    const offer =
      kind === 'renewal'
        ? offers.find((item) => item.offerType === 'renewal')
        : offers.find((item) => item.club.id !== completed.currentClub.id);
    expect(offer).toBeDefined();
    const next = acceptProfessionalOffer({ ...completed, professionalOffers: offers }, offer!.id);
    expect(next.currentSeason).toBe(completed.currentSeason + 1);
    expect(next.careerSeasonNumber).toBe(completed.careerSeasonNumber + 1);
    expect(next.currentContract).toEqual(offer!.contract);
    expect(next.currentClub.id).toBe(offer!.club.id);
    expect(next.currentProfessionalClub?.id).toBe(offer!.club.id);
    expect(
      kind === 'renewal' ? next.currentClub.id : next.currentClub.id !== completed.currentClub.id,
    ).toBe(kind === 'renewal' ? completed.currentClub.id : true);
    expect(next.professionalOffers).toBeUndefined();
    expect(next.leagueSeason?.completed).toBe(false);
    expect(next.careerCalendar?.seasonId).toBe(next.leagueSeason?.id);
    expect(next.player.age).toBe(getProfileAge(next.player, `${next.currentSeason}-07-01`));
    const parsed = careerStateSchema.safeParse(next);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
  });
});

describe('annual background lifecycle', () => {
  it('retains identities and deterministically replenishes every academy to its target shape', () => {
    const base = createCareer('recurring-intake');
    const graduated = processYouthGraduation(base).career;
    const next = processYouthIntake(graduated);
    const repeated = processYouthIntake(next);
    expect(repeated.worldDelta).toEqual(next.worldDelta);
    for (const team of getPolishU17TeamDefinitions(next.clubWorld ?? [])) {
      const oldIds = next.worldDelta!.youthCohortOverrides![getYouthCohortKey(team.id, 2026)]!;
      const ids = next.worldDelta!.youthCohortOverrides![getYouthCohortKey(team.id, 2027)]!;
      expect(ids).toHaveLength(24);
      expect(oldIds.every((id) => ids.includes(id))).toBe(true);
      expect(new Set(ids).size).toBe(24);
      for (const id of ids) {
        const footballer = (next.worldDelta!.newFootballers[id] ?? next.footballerWorld![id])!;
        expect(footballer).toBeDefined();
        if (next.worldDelta!.newFootballers[id]) {
          expect(getProfileAge(footballer.profile, '2027-07-01')).toBeGreaterThanOrEqual(15);
          expect(getProfileAge(footballer.profile, '2027-07-01')).toBeLessThan(17);
          expect(footballer.currentClubId).toBeUndefined();
        }
      }
    }
    expect(careerStateSchema.safeParse(next).success).toBe(true);
  });

  it('uses a later retirement curve for goalkeepers and keeps affected squads simulatable', () => {
    const base = createCareer('retirement-curve');
    const sample = Object.values(base.footballerWorld!)[0]!;
    const oldProfile = { ...sample.profile, dateOfBirth: '1992-01-01', age: 34 };
    const outfield = projectNpcRetirement({
      footballer: { ...sample, profile: { ...oldProfile, primaryPosition: 'center_back' } },
      boundaryDate: '2027-07-01',
      seed: base.seed,
    });
    const goalkeeper = projectNpcRetirement({
      footballer: { ...sample, profile: { ...oldProfile, primaryPosition: 'goalkeeper' } },
      boundaryDate: '2027-07-01',
      seed: base.seed,
    });
    expect(goalkeeper.probability).toBeLessThan(outfield.probability);
    const processed = processNpcRetirements(base, '2041-07-01');
    const repeated = processNpcRetirements(processed, '2041-07-01');
    expect(repeated.worldDelta).toEqual(processed.worldDelta);
    for (const club of processed.clubWorld ?? []) {
      const squad = processed.worldDelta!.squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
      expect(squad).toHaveLength(18);
      expect(squad.some((id) => processed.worldDelta!.retiredFootballerIds.includes(id))).toBe(
        false,
      );
    }
  });
});
