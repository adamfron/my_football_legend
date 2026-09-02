import { describe, expect, it } from 'vitest';
import { careerStateSchema } from '../schemas/domainSchemas';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { processNpcTransferMarket } from './npcTransferMarket';

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
  it('is deterministic, idempotent, bounded and preserves moved identities', () => {
    let seedIndex = 0;
    let base = createCareer(`npc-market-stable-${seedIndex}`);
    let first = processNpcTransferMarket(base, '2027-07-01');
    while (!Object.keys(first.worldDelta?.footballerOverrides ?? {}).length && seedIndex++ < 20) {
      base = createCareer(`npc-market-stable-${seedIndex}`);
      first = processNpcTransferMarket(base, '2027-07-01');
    }
    const same = processNpcTransferMarket(createCareer(base.seed), '2027-07-01');
    const repeated = processNpcTransferMarket(first, '2027-07-01');
    expect(first.worldDelta).toEqual(same.worldDelta);
    expect(repeated.worldDelta).toEqual(first.worldDelta);
    expect(first.worldDelta?.npcTransferMarketProcessedThroughSeason).toBe(2026);
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
    const moved = Object.values(first.worldDelta?.footballerOverrides ?? {}).find(
      (footballer) => beforeMembership.get(footballer.profile.id) !== footballer.currentClubId,
    );
    expect(moved).toBeDefined();
    const original = base.footballerWorld![moved!.profile.id]!;
    expect(moved).toMatchObject({
      profile: original.profile,
      developmentProfile: original.developmentProfile,
    });
    expect(after.get(beforeMembership.get(moved!.profile.id)!)!).not.toContain(moved!.profile.id);
    expect(after.get(moved!.currentClubId!)!.filter((id) => id === moved!.profile.id)).toHaveLength(
      1,
    );
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
      signed = Boolean(candidate.worldDelta?.footballerOverrides[freeId]?.currentClubId);
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
