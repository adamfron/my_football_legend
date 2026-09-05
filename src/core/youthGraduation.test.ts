import { describe, expect, test } from 'vitest';
import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { processYouthGraduation, YOUTH_GRADUATION_AGE } from './youthGraduation';
import { resolveEffectiveSeniorSquad, resolveYouthCohort } from './worldDatabase';
import { getProfileAge } from './age';
import { processSummerSquadMarket } from './npcTransferMarket';
import { auditUnattachedProfessionals } from './worldIntegrity';

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

  test('derives boundary age without writing annual age overrides', () => {
    const original = createCareer('graduation-membership');
    const key = getYouthCohortKey('club_vistula_nova', 2026);
    const base = original.youthCohorts![key]!;
    const result = processYouthGraduation(original).career;
    const effective = resolveYouthCohort(result, key)!;

    for (const id of base) {
      const before = original.footballerWorld![id]!;
      const boundaryAge = getProfileAge(before.profile, '2027-06-30');
      expect(effective.includes(id)).toBe(boundaryAge < YOUTH_GRADUATION_AGE);
      if (boundaryAge < YOUTH_GRADUATION_AGE)
        expect(result.worldDelta!.footballerOverrides[id]).toBeUndefined();
    }
  });

  test('releases graduates into the canonical summer pool without signing or copying cards', () => {
    const original = createCareer('graduation-market');
    const canonical = structuredClone(original.youthCohorts);
    const { career, diagnostics } = processYouthGraduation(original);
    const graduateIds = career.worldDelta!.currentGraduateIds!;
    expect(diagnostics.graduates).toBeGreaterThan(0);
    expect(diagnostics).toMatchObject({
      parentClubPromotions: 0,
      externalFirstContracts: 0,
      unattachedGraduates: diagnostics.graduates,
    });
    expect(graduateIds).toHaveLength(diagnostics.graduates);
    expect(career.worldDelta!.footballerOverrides).toEqual({});
    expect(career.worldDelta!.newFootballers).toEqual({});
    expect(original.youthCohorts).toEqual(canonical);
    expect(graduateIds).not.toContain(original.player.id);
    const unattached = auditUnattachedProfessionals(career);
    expect(unattached).toMatchObject({
      total: diagnostics.graduates,
      currentSeasonGraduates: diagnostics.graduates,
      unattachedSeasonsKnown: 0,
      unattachedSeasonsUnknown: diagnostics.graduates,
    });
    expect(Object.values(unattached.ageBuckets).reduce((sum, count) => sum + count, 0)).toBe(
      diagnostics.graduates,
    );
    expect(Object.values(unattached.overallBuckets).reduce((sum, count) => sum + count, 0)).toBe(
      diagnostics.graduates,
    );
    for (const id of graduateIds) {
      expect(career.worldDelta!.footballerStateOverrides![id]).toEqual({
        currentClubId: null,
        currentContract: null,
        careerStatus: 'active',
      });
      expect(
        Object.values(career.worldDelta!.squadOverrides).some((squad) => squad.includes(id)),
      ).toBe(false);
    }
  });

  test('graduates are signed through the one summer market, including parent and external moves', () => {
    const original = createCareer('graduation-common-market');
    const graduated = processYouthGraduation(original).career;
    const graduateIds = new Set(graduated.worldDelta!.currentGraduateIds!);
    const sourceTeamByPlayer = new Map<string, string | undefined>();
    for (const team of getPolishU17TeamDefinitions(original.clubWorld ?? []))
      for (const id of original.youthCohorts![getYouthCohortKey(team.id, 2026)] ?? [])
        sourceTeamByPlayer.set(id, team.parentClubId);
    const withVacancies = {
      ...graduated,
      worldDelta: {
        ...graduated.worldDelta!,
        squadOverrides: Object.fromEntries(
          graduated.clubWorld!.map((club) => [club.id, club.squadPlayerIds!.slice(0, 22)]),
        ),
      },
    };
    const marketed = processSummerSquadMarket(withVacancies, '2027-07-01');
    const destinations = new Map<string, string>();
    for (const club of marketed.clubWorld ?? [])
      for (const id of resolveEffectiveSeniorSquad(marketed, club.id))
        if (graduateIds.has(id)) destinations.set(id, club.id);
    expect(destinations.size).toBeGreaterThan(0);
    expect([...destinations].some(([id, clubId]) => sourceTeamByPlayer.get(id) === clubId)).toBe(
      true,
    );
    expect(
      [...destinations].some(
        ([id, clubId]) => sourceTeamByPlayer.get(id) && sourceTeamByPlayer.get(id) !== clubId,
      ),
    ).toBe(true);
    for (const [id, clubId] of destinations) {
      expect(marketed.worldDelta!.footballerStateOverrides![id]!.currentClubId).toBe(clubId);
      expect(
        (marketed.clubWorld ?? []).filter((club) =>
          resolveEffectiveSeniorSquad(marketed, club.id).includes(id),
        ),
      ).toHaveLength(1);
    }
    const rejected = [...graduateIds].filter((id) => !destinations.has(id));
    expect(rejected.length).toBeGreaterThan(0);
    for (const id of rejected) {
      expect(marketed.worldDelta!.footballerStateOverrides![id]).toBeUndefined();
      expect(
        (marketed.clubWorld ?? []).some((club) =>
          resolveEffectiveSeniorSquad(marketed, club.id).includes(id),
        ),
      ).toBe(false);
    }
    expect(marketed.worldDelta!.professionalMarketExitCount).toBeGreaterThanOrEqual(
      rejected.length,
    );
  });
});
