import { describe, expect, test } from 'vitest';
import { getYouthCohortKey } from '../content/world/polishU17';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { processYouthGraduation, YOUTH_GRADUATION_AGE } from './youthGraduation';
import { resolveYouthCohort } from './worldDatabase';

const createCareer = (seed: string) =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Testowy',
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

describe('U-17 graduation and first contracts', () => {
  test('is deterministic, idempotent and leaves the canonical cohort immutable', () => {
    const original = createCareer('graduation-stable');
    const canonical = structuredClone(original.youthCohorts);
    const first = processYouthGraduation(original);
    const repeated = processYouthGraduation(first.career);
    const independent = processYouthGraduation(createCareer('graduation-stable'));

    expect(first).toEqual(independent);
    expect(repeated.career.worldDelta).toEqual(first.career.worldDelta);
    expect(original.youthCohorts).toEqual(canonical);
    expect(repeated.diagnostics.graduates).toBe(0);
  });

  test('ages everyone once, removes graduates and retains younger players', () => {
    const original = createCareer('graduation-membership');
    const key = getYouthCohortKey('club_vistula_nova', 2026);
    const base = original.youthCohorts![key]!;
    const result = processYouthGraduation(original).career;
    const effective = resolveYouthCohort(result, key)!;

    for (const id of base) {
      const before = original.footballerWorld![id]!;
      const after = result.worldDelta!.footballerOverrides[id]!;
      expect(after.profile.age).toBe(before.profile.age + 1);
      expect(effective.includes(id)).toBe(after.profile.age < YOUTH_GRADUATION_AGE);
    }
  });

  test('persists graduates as exactly one signed squad member or an unattached free agent', () => {
    const original = createCareer('graduation-market');
    const { career, diagnostics } = processYouthGraduation(original);
    const graduated = Object.values(career.worldDelta!.footballerOverrides).filter(
      (item) => item.profile.age >= YOUTH_GRADUATION_AGE,
    );
    expect(diagnostics.graduates).toBeGreaterThan(0);
    expect(diagnostics.parentClubPromotions).toBeGreaterThan(0);
    expect(diagnostics.externalFirstContracts).toBeGreaterThan(0);
    expect(diagnostics.unattachedGraduates).toBeGreaterThan(0);
    for (const player of graduated) {
      const memberships = Object.values(career.worldDelta!.squadOverrides).filter((squad) =>
        squad.includes(player.profile.id),
      );
      expect(memberships).toHaveLength(player.currentContract ? 1 : 0);
      expect(player.currentContract?.clubId).toBe(player.currentClubId);
    }
    const vistulaIds = new Set(
      original.youthCohorts![getYouthCohortKey('club_vistula_nova', 2026)]!,
    );
    expect(
      graduated
        .filter((player) => vistulaIds.has(player.profile.id))
        .every((player) => player.currentClubId !== 'club_vistula_nova'),
    ).toBe(true);
    expect(graduated.some((player) => player.profile.id === original.player.id)).toBe(false);
  });
});
