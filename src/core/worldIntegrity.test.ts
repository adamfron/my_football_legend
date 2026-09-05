import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { auditSeniorWorld } from './worldIntegrity';
import { resolveCareerWorldFootballer, resolveEffectiveSeniorSquad } from './worldDatabase';
import {
  deriveSquadHierarchy,
  getManagerSelectionScore,
  getSquadDerivedClubStrength,
} from './footballerWorld';
import { getCurrentSquadSelectionContext } from './youthWorld';

const createCareer = (seed: string) =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Integralność',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'striker',
        heightCm: 180,
        weightKg: 74,
        seed,
      },
      seed,
      0,
    ),
    seed,
  );

describe('canonical effective senior squad', () => {
  it('exposes one override identically to audit, UI context, manager selection and strength', () => {
    const base = createCareer('effective-squad');
    const club = base.clubWorld![0]!;
    const ids = club.squadPlayerIds!.slice(0, 18);
    const career = {
      ...base,
      currentProfessionalClub: club,
      worldDelta: {
        ...base.worldDelta!,
        squadOverrides: { [club.id]: ids },
      },
    };
    const effective = resolveEffectiveSeniorSquad(career, club.id);
    const context = getCurrentSquadSelectionContext(career)!;
    expect(context.squadPlayerIds).toEqual(effective);
    const hierarchy = deriveSquadHierarchy(career, context);
    expect(
      [
        ...hierarchy.preferredXI,
        ...hierarchy.bench,
        ...hierarchy.deepReserve.map((player) => ({ footballerId: player.id })),
      ]
        .map((item) => item.footballerId)
        .sort(),
    ).toEqual([...effective].sort());
    expect(getSquadDerivedClubStrength(career, context)).toBeDefined();
    expect(auditSeniorWorld(career).activeSeniorFootballers).toBe(
      new Set(
        (career.clubWorld ?? []).flatMap((item) => resolveEffectiveSeniorSquad(career, item.id)),
      ).size,
    );
    expect(careerStateSchema.safeParse(career).success).toBe(true);
  });
});

describe('date-aware manager evaluation', () => {
  it('uses a projected NPC profile at each date instead of a stale global score', () => {
    const career = createCareer('selection-date');
    const club = career.clubWorld![0]!;
    const id = club.squadPlayerIds!.find(
      (candidate) => career.footballerWorld![candidate]!.profile.primaryPosition !== 'goalkeeper',
    )!;
    const early = { ...career, currentDate: '2026-07-01' };
    const late = { ...career, currentDate: '2036-07-01' };
    const earlyPlayer = resolveCareerWorldFootballer(early, id)!;
    const latePlayer = resolveCareerWorldFootballer(late, id)!;
    const earlyScore = getManagerSelectionScore(
      early,
      club,
      earlyPlayer.profile,
      earlyPlayer.profile.primaryPosition,
    );
    const lateScore = getManagerSelectionScore(
      late,
      club,
      latePlayer.profile,
      latePlayer.profile.primaryPosition,
    );
    expect(latePlayer.profile.attributes).not.toEqual(earlyPlayer.profile.attributes);
    expect(lateScore).not.toBe(earlyScore);
  });
});
