import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  canTargetSummerCandidate,
  compareClubMarketPriority,
  processSummerSquadMarket,
  STABLE_VOLUNTARY_DEPARTURE_CAP,
  RELEGATED_VOLUNTARY_DEPARTURE_CAP,
} from './npcTransferMarket';
import {
  deriveClubFinancialCapacity,
  deriveCommittedMonthlyWages,
  estimateNpcMonthlySalary,
  estimateNpcTransferValue,
} from './npcTransferEconomics';

const createCareer = (seed: string) =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Rynek',
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

describe('bounded NPC summer transfer market', () => {
  it('derives deterministic, tier-sensitive seasonal capacity', () => {
    const career = createCareer('npc-finance');
    const club = career.clubWorld![0]!;
    expect(deriveClubFinancialCapacity(club, career.seed, 2027)).toEqual(
      deriveClubFinancialCapacity(club, career.seed, 2027),
    );
    const averages = ([1, 2, 3, 4] as const).map((leagueTier) =>
      Array.from(
        { length: 30 },
        (_, index) =>
          deriveClubFinancialCapacity(
            { ...club, id: `${club.id}-${leagueTier}-${index}`, leagueTier },
            career.seed,
            2027,
          ).transferBudget,
      ).reduce((sum, value) => sum + value, 0),
    );
    expect(averages[0]).toBeGreaterThan(averages[1]!);
    expect(averages[1]).toBeGreaterThan(averages[2]!);
    expect(averages[2]).toBeGreaterThan(averages[3]!);
  });

  it('values expired players as free while every signing carries a wage', () => {
    const career = createCareer('npc-values');
    const source = career.clubWorld![0]!;
    const destination = career.clubWorld![1]!;
    const player = career.footballerWorld![source.squadPlayerIds![0]!]!;
    expect(
      estimateNpcTransferValue(
        { ...player, currentContract: { ...player.currentContract!, endDate: '2026-06-30' } },
        { boundaryDate: '2027-07-01', sourceClub: source, destinationClub: destination },
      ),
    ).toBe(0);
    expect(
      estimateNpcTransferValue(player, {
        boundaryDate: player.currentContract!.startDate,
        sourceClub: source,
        destinationClub: destination,
      }),
    ).toBeGreaterThan(0);
    const salary = estimateNpcMonthlySalary(player, destination, 'rotation', '2027-07-01');
    expect(salary).toBeGreaterThan(0);
    expect(
      deriveCommittedMonthlyWages(
        [player.profile.id],
        () => ({
          ...player,
          currentContract: {
            ...player.currentContract!,
            startDate: '2027-07-01',
            endDate: '2028-06-30',
            monthlySalary: salary,
          },
        }),
        '2027-07-01',
      ),
    ).toBe(salary);
  });

  it('builds every squad once, consumes free agents first and preserves unique membership', () => {
    const base = createCareer('canonical-summer-market');
    const club = base.clubWorld![0]!;
    const freeId = club.squadPlayerIds![0]!;
    const prepared = {
      ...base,
      worldDelta: {
        ...base.worldDelta!,
        squadOverrides: { [club.id]: club.squadPlayerIds!.filter((id) => id !== freeId) },
        footballerStateOverrides: { [freeId]: { currentClubId: null, currentContract: null } },
      },
    };
    const first = processSummerSquadMarket(prepared, '2027-07-01');
    const repeated = processSummerSquadMarket(first, '2027-07-01');
    expect(repeated.worldDelta).toEqual(first.worldDelta);
    const diagnostics = first.worldDelta!.summerMarketDiagnostics!;
    expect(diagnostics.clubsUnfieldable).toBe(0);
    expect(diagnostics.duplicateMemberships).toBe(0);
    expect(diagnostics.maxSquadSize).toBeLessThanOrEqual(30);
    expect(diagnostics.freeAgentSignings).toBeGreaterThan(0);
    expect(first.worldDelta!.footballerStateOverrides![freeId]!.currentClubId).toBeTruthy();
    expect(careerStateSchema.safeParse(first).success).toBe(true);
  });

  it('enforces top-down directional poaching while allowing listed players in either direction', () => {
    const clubs = [...createCareer('directional-market').clubWorld!].sort(
      compareClubMarketPriority,
    );
    const stronger = clubs[0]!;
    const weaker = clubs.at(-1)!;
    expect(canTargetSummerCandidate(stronger, weaker, 'poachable')).toBe(true);
    expect(canTargetSummerCandidate(weaker, stronger, 'poachable')).toBe(false);
    expect(canTargetSummerCandidate(weaker, stronger, 'wants_move')).toBe(true);
    const sameTier = clubs.find(
      (club) => club.leagueTier === stronger.leagueTier && club.id !== stronger.id,
    )!;
    const [higher, lower] = [stronger, sameTier].sort(compareClubMarketPriority);
    expect(canTargetSummerCandidate(higher!, lower!, 'poachable')).toBe(true);
  });

  it('uses calibrated voluntary departure caps', () => {
    expect(STABLE_VOLUNTARY_DEPARTURE_CAP).toBe(5);
    expect(RELEGATED_VOLUNTARY_DEPARTURE_CAP).toBe(10);
  });
});
