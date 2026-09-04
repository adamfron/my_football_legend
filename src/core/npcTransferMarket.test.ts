import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { processNpcTransferMarket } from './npcTransferMarket';
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

const effectiveSquads = (career: ReturnType<typeof createCareer>) =>
  new Map(
    (career.clubWorld ?? []).map((club) => [
      club.id,
      career.worldDelta?.squadOverrides[club.id] ?? club.squadPlayerIds ?? [],
    ]),
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

  it('is deterministic, idempotent, bounded and preserves moved identities', () => {
    let seedIndex = 0;
    let base = createCareer(`npc-market-stable-${seedIndex}`);
    let first = processNpcTransferMarket(base, '2027-07-01');
    while (
      !Object.keys(first.worldDelta?.footballerStateOverrides ?? {}).length &&
      seedIndex++ < 20
    ) {
      base = createCareer(`npc-market-stable-${seedIndex}`);
      first = processNpcTransferMarket(base, '2027-07-01');
    }
    const same = processNpcTransferMarket(createCareer(base.seed), '2027-07-01');
    const repeated = processNpcTransferMarket(first, '2027-07-01');
    expect(first.worldDelta).toEqual(same.worldDelta);
    expect(repeated.worldDelta).toEqual(first.worldDelta);
    expect(first.worldDelta?.npcTransferMarketProcessedThroughSeason).toBe(2026);
    expect(first.worldDelta?.npcTransferRecords).toHaveLength(
      Object.keys(first.worldDelta?.footballerStateOverrides ?? {}).length,
    );
    expect(repeated.worldDelta?.npcTransferRecords).toEqual(first.worldDelta?.npcTransferRecords);
    expect(first.worldDelta?.footballerOverrides[first.player.id]).toBeUndefined();
    const beforeMembership = new Map<string, string>();
    for (const club of base.clubWorld ?? [])
      for (const id of club.squadPlayerIds ?? []) beforeMembership.set(id, club.id);
    const after = effectiveSquads(first);
    const occurrences = new Map<string, number>();
    for (const ids of after.values())
      for (const id of ids) occurrences.set(id, (occurrences.get(id) ?? 0) + 1);
    expect([...occurrences.values()].every((count) => count === 1)).toBe(true);
    expect(
      [...after.entries()].every(
        ([clubId, ids]) =>
          ids.length -
            (base.clubWorld?.find((club) => club.id === clubId)?.squadPlayerIds?.length ?? 0) <=
          3,
      ),
    ).toBe(true);
    const moved = Object.entries(first.worldDelta?.footballerStateOverrides ?? {}).find(
      ([id, state]) => beforeMembership.get(id) !== state.currentClubId,
    );
    expect(moved).toBeDefined();
    const [movedId, movedState] = moved!;
    expect(base.footballerWorld![movedId]).toBeDefined();
    expect(after.get(beforeMembership.get(movedId)!)!).not.toContain(movedId);
    expect(after.get(movedState.currentClubId!)!.filter((id) => id === movedId)).toHaveLength(1);
    expect(careerStateSchema.safeParse(first).success).toBe(true);
  });

  it('can sign an unattached senior and excludes retired footballers and the protagonist', () => {
    const base = createCareer('npc-market-free-agent');
    const club = base.clubWorld![0]!;
    const freeId = club.squadPlayerIds![0]!;
    const retiredId = club.squadPlayerIds![1]!;
    const free = base.footballerWorld![freeId]!;
    const retired = base.footballerWorld![retiredId]!;
    const prepared = {
      ...base,
      worldDelta: {
        ...base.worldDelta!,
        squadOverrides: {
          [club.id]: club.squadPlayerIds!.filter((id) => id !== freeId && id !== retiredId),
        },
        footballerOverrides: {
          [freeId]: { ...free, currentClubId: undefined, currentContract: undefined },
          [retiredId]: {
            ...retired,
            careerStatus: 'retired' as const,
            currentClubId: undefined,
            currentContract: undefined,
          },
        },
        retiredFootballerIds: [retiredId],
      },
    };
    let signed = false;
    for (let index = 0; index < 80 && !signed; index++) {
      const candidate = processNpcTransferMarket(
        { ...prepared, seed: `free-agent-${index}` },
        '2027-07-01',
      );
      signed = Boolean(candidate.worldDelta?.footballerStateOverrides?.[freeId]?.currentClubId);
      expect(candidate.worldDelta?.footballerOverrides[retiredId]?.careerStatus).toBe('retired');
      expect(candidate.worldDelta?.footballerOverrides[candidate.player.id]).toBeUndefined();
    }
    expect(signed).toBe(true);
  });

  it('different seeds can produce different plausible outcomes', () => {
    const a = processNpcTransferMarket(createCareer('npc-market-a'), '2027-07-01');
    const b = processNpcTransferMarket(createCareer('npc-market-b'), '2027-07-01');
    expect(a.worldDelta?.squadOverrides).not.toEqual(b.worldDelta?.squadOverrides);
  });
});
