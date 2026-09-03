import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import type { ClubSeasonProjection } from './clubWorld';
import {
  deriveCanonicalCoachProfile,
  resolveClubManagerId,
  resolveCoachProfile,
} from './coachProfiles';
import { getManagerPreferredFormation } from './footballerWorld';
import { getManagerDismissalPressure, processManagerLifecycle } from './managerLifecycle';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { getCurrentSquadSelectionContext } from './youthWorld';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 180,
        weightKg: 74,
        seed: 'manager-life',
      },
      'manager-life',
      0,
    ),
    'manager-life',
  );
const result = (
  clubId: string,
  finish: number,
  nextTier: number,
  previousTier: number,
): ClubSeasonProjection => ({
  clubId,
  finish,
  nextTier,
  previousTier,
  clubCount: 16,
  promoted: nextTier < previousTier,
  relegated: nextTier > previousTier,
});

describe('persistent manager lifecycle', () => {
  it('is deterministic, idempotent, fills vacancies and never duplicates a coach', () => {
    const base = career();
    const projections = base.clubWorld!.map((club) =>
      result(club.id, 16, Math.min(4, club.leagueTier + 1), club.leagueTier),
    );
    const first = processManagerLifecycle(base, '2027-07-01', projections);
    const second = processManagerLifecycle(career(), '2027-07-01', projections);
    expect(first.worldDelta?.managerOverrides).toEqual(second.worldDelta?.managerOverrides);
    expect(processManagerLifecycle(first, '2027-07-01', projections)).toBe(first);
    const assignments = base.clubWorld!.map((club) => resolveClubManagerId(first, club.id));
    expect(assignments.every(Boolean)).toBe(true);
    expect(new Set(assignments).size).toBe(assignments.length);
    expect(first.worldDelta?.managerMoveRecords?.length).toBe(
      Object.keys(first.worldDelta?.managerOverrides ?? {}).length * 2,
    );
    expect(careerStateSchema.safeParse(first).success).toBe(true);
  });

  it('promotion protects while relegation and pressure materially increase dismissal pressure', () => {
    const club = career().clubWorld!.find((item) => item.leagueTier > 1)!;
    const expected = 4;
    const retained = getManagerDismissalPressure(
      club,
      result(club.id, 1, club.leagueTier, club.leagueTier),
      expected,
      'x',
    );
    const promoted = getManagerDismissalPressure(
      club,
      result(club.id, 1, Math.max(1, club.leagueTier - 1), club.leagueTier),
      expected,
      'x',
    );
    const relegated = getManagerDismissalPressure(
      club,
      result(club.id, 16, Math.min(4, club.leagueTier + 1), club.leagueTier),
      expected,
      'x',
    );
    expect(promoted).toBeLessThan(retained);
    expect(relegated).toBeGreaterThan(retained + 50);
    expect(
      getManagerDismissalPressure(
        { ...club, pressureLevel: 90 },
        result(club.id, 10, club.leagueTier, club.leagueTier),
        expected,
        'x',
      ),
    ).toBeGreaterThan(
      getManagerDismissalPressure(
        { ...club, pressureLevel: 20 },
        result(club.id, 10, club.leagueTier, club.leagueTier),
        expected,
        'x',
      ),
    );
  });

  it('replacement keeps stable profiles and immediately supplies the hierarchy formation', () => {
    const base = career();
    const club = { ...base.clubWorld![0]!, pressureLevel: 100, strengthRating: 99 };
    const oldId = club.managerId!;
    const state = {
      ...base,
      clubWorld: [club, ...base.clubWorld!.slice(1)],
      currentProfessionalClub: club,
      currentClub: { ...base.currentClub, id: club.id, name: club.name },
    };
    const projections = state.clubWorld!.map((item) =>
      result(item.id, item.id === club.id ? 16 : 1, item.leagueTier, item.leagueTier),
    );
    const next = processManagerLifecycle(state, '2027-07-01', projections);
    const newId = next.worldDelta?.managerOverrides[club.id];
    expect(newId).toBeDefined();
    expect(newId).not.toBe(oldId);
    expect(resolveCoachProfile(next, club.id)?.personId).toBe(newId);
    expect(deriveCanonicalCoachProfile(oldId)).toEqual(deriveCanonicalCoachProfile(oldId));
    const context = getCurrentSquadSelectionContext(next)!;
    expect(context.managerId).toBe(newId);
    expect(getManagerPreferredFormation(context.managerId)).toBe(
      resolveCoachProfile(next, club.id)?.preferredFormation,
    );
    expect(next.significantPeople.filter((person) => person.id === newId)).toHaveLength(1);
  });
});
