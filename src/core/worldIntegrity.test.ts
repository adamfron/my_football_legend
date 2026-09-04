import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  auditSeniorWorld,
  processCriticalSquadRepair,
  SENIOR_SQUAD_LIMITS,
} from './worldIntegrity';
import { resolveCareerWorldFootballer } from './worldDatabase';
import { getManagerSelectionScore } from './footballerWorld';

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

describe('critical senior-world repair', () => {
  it('deterministically repairs 2 GK / 9 outfield while leaving healthy clubs untouched', () => {
    const base = createCareer('critical-repair');
    const broken = base.clubWorld![0]!;
    const healthy = base.clubWorld![1]!;
    const goalkeepers = broken
      .squadPlayerIds!.filter(
        (id) => base.footballerWorld![id]!.profile.primaryPosition === 'goalkeeper',
      )
      .slice(0, 2);
    const outfield = broken
      .squadPlayerIds!.filter(
        (id) => base.footballerWorld![id]!.profile.primaryPosition !== 'goalkeeper',
      )
      .slice(0, 9);
    const career = {
      ...base,
      worldDelta: {
        ...base.worldDelta!,
        squadOverrides: { [broken.id]: [...goalkeepers, ...outfield] },
      },
    };
    const first = processCriticalSquadRepair(career, '2027-07-01');
    const second = processCriticalSquadRepair(career, '2027-07-01');
    expect(first.worldDelta).toEqual(second.worldDelta);
    expect(first.worldDelta!.squadOverrides[broken.id]).toHaveLength(SENIOR_SQUAD_LIMITS.healthy);
    expect(first.worldDelta!.squadOverrides[healthy.id]).toBeUndefined();
    const audit = auditSeniorWorld(first);
    expect(audit.clubsBelow11).toBe(0);
    expect(audit.clubsWithoutGoalkeeper).toBe(0);
    expect(audit.clubsWithoutTenOutfield).toBe(0);
    expect(audit.duplicateActiveSeniorMemberships).toBe(0);
    expect(audit.maxSquadSize).toBeLessThanOrEqual(SENIOR_SQUAD_LIMITS.hardMaximum);
    expect(careerStateSchema.safeParse(first).success).toBe(true);
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
