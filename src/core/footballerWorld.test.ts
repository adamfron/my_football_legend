import { describe, expect, it } from 'vitest';
import {
  generateStartingPlayerProfile,
  createCareerState,
  defaultBodyForPosition,
} from './playerCreator';
import { getEffectivePositionOverall, OVR_ATTRIBUTE_KEYS } from './playerOverall';
import {
  FORMATIONS,
  deriveSquadHierarchy,
  getFootballerSportingStatus,
  getManagerPreferredFormation,
  getSportingStatus,
  getSquadDerivedClubStrength,
  populateFootballerWorld,
  resolveFootballer,
  selectBestXI,
  selectMatchBench,
} from './footballerWorld';
import { generateProfessionalClubPool } from './professionalClubs';
import { developmentProfileSchema, footballerProfileSchema } from '../schemas/domainSchemas';

const career = () => {
  const [heightCm, weightKg] = defaultBodyForPosition('attacking_midfielder');
  const profile = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Test',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      difficulty: 'normal',
      position: 'attacking_midfielder',
      heightCm,
      weightKg,
      seed: 'world-test',
    },
    'world-test',
    0,
  );
  return createCareerState(profile, 'world-test');
};

describe('persistent footballer world', () => {
  it('normalizes a deterministic 24-player squad for every professional club', () => {
    const first = populateFootballerWorld(generateProfessionalClubPool('registry'), 'registry');
    const repeated = populateFootballerWorld(generateProfessionalClubPool('registry'), 'registry');
    expect(first.clubs).toHaveLength(64);
    expect(first.clubs.every((club) => club.squadPlayerIds?.length === 24)).toBe(true);
    expect(Object.keys(first.footballerWorld)).toHaveLength(1536);
    expect(new Set(first.clubs.flatMap((club) => club.squadPlayerIds!)).size).toBe(1536);
    expect(first).toEqual(repeated);
    for (const player of Object.values(first.footballerWorld)) {
      expect(player.currentContract).toBeDefined();
      expect(player.currentContract?.clubId).toBe(player.currentClubId);
      expect(player.currentContract?.contractType).toBe('professional');
      expect(player.currentContract?.monthlySalary).toBeGreaterThan(0);
      expect(Date.parse(player.currentContract!.endDate)).toBeGreaterThan(
        Date.parse(player.currentContract!.startDate),
      );
    }
  });

  it('derives a deterministic, complete XI, bench and deep reserve hierarchy', () => {
    const state = career();
    const club = state.clubWorld![0]!;
    const first = deriveSquadHierarchy(state, club, '4-3-3');
    const repeated = deriveSquadHierarchy(state, club, '4-3-3');
    expect(first).toEqual(repeated);
    // Manager hierarchy is deliberately separate from the pure quality XI used for club strength.
    expect(first.bench).toEqual(selectMatchBench(state, club, first.preferredXI));
    for (const id of club.squadPlayerIds!)
      expect(getFootballerSportingStatus(state, club, id, '4-3-3')).toBe(
        getSportingStatus(first, id),
      );
    expect(first.preferredXI).toHaveLength(11);
    expect(first.bench).toHaveLength(7);
    const ids = [
      ...first.preferredXI.map((item) => item.footballerId),
      ...first.bench.map((item) => item.footballerId),
      ...first.deepReserve.map((item) => item.id),
    ];
    expect(ids).toHaveLength(club.squadPlayerIds!.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(first.bench.map((item) => item.position)).toContain('goalkeeper');
    expect(
      first.bench.some((item) =>
        ['center_back', 'left_back', 'right_back'].includes(item.position),
      ),
    ).toBe(true);
    expect(
      first.bench.some((item) =>
        ['defensive_midfielder', 'attacking_midfielder'].includes(item.position),
      ),
    ).toBe(true);
    expect(
      first.bench.some((item) =>
        ['left_winger', 'right_winger', 'striker'].includes(item.position),
      ),
    ).toBe(true);
  });

  it('creates varied wages that are not ordered strictly by OVR', () => {
    const state = career();
    const players = Object.values(state.footballerWorld!);
    const salaries = players.map((player) => player.currentContract!.monthlySalary);
    expect(new Set(salaries).size).toBeGreaterThan(500);
    expect(Math.max(...salaries) / Math.min(...salaries)).toBeGreaterThan(10);
    const byClub = new Map<string, typeof players>();
    for (const player of players) {
      const squad = byClub.get(player.currentClubId!) ?? [];
      squad.push(player);
      byClub.set(player.currentClubId!, squad);
    }
    expect(
      [...byClub.values()].some((squad) =>
        squad.some((stronger) =>
          squad.some(
            (weaker) =>
              getEffectivePositionOverall(stronger.profile, stronger.profile.primaryPosition) >
                getEffectivePositionOverall(weaker.profile, weaker.profile.primaryPosition) + 3 &&
              stronger.currentContract!.monthlySalary < weaker.currentContract!.monthlySalary,
          ),
        ),
      ),
    ).toBe(true);
  });

  it('uses canonical cards and valid persistent development profiles without cloning the protagonist', () => {
    const state = career();
    expect(state.footballerWorld?.[state.player.id]).toBeUndefined();
    const npc = Object.values(state.footballerWorld!)[0]!;
    expect(footballerProfileSchema.parse(npc.profile)).toEqual(npc.profile);
    expect(developmentProfileSchema.parse(npc.developmentProfile)).toEqual(npc.developmentProfile);
    expect(Object.keys(npc.profile.attributes)).toHaveLength(OVR_ATTRIBUTE_KEYS.length);
    expect(resolveFootballer(state, npc.profile.id)).toBe(resolveFootballer(state, npc.profile.id));
  });

  it('selects eleven distinct players using the manager formation and effective OVR', () => {
    const state = career();
    const club = state.clubWorld![0]!;
    const formation = getManagerPreferredFormation(club.managerId);
    expect(FORMATIONS[formation]).toHaveLength(11);
    expect(formation).toBe(getManagerPreferredFormation(club.managerId));
    const xi = selectBestXI(state, club, formation);
    expect(xi.assignments).toHaveLength(11);
    expect(new Set(xi.assignments.map((item) => item.footballerId)).size).toBe(11);
    for (const item of xi.assignments)
      expect(item.effectiveOverall).toBe(
        getEffectivePositionOverall(resolveFootballer(state, item.footballerId)!, item.position),
      );
    expect(getSquadDerivedClubStrength(state, club)).toBe(
      Math.round(xi.assignments.reduce((sum, item) => sum + item.effectiveOverall, 0) / 11),
    );
  });

  it('creates age, archetype-shaped quality and tier diversity', () => {
    const state = career();
    const players = Object.values(state.footballerWorld!).map((item) => item.profile);
    expect(Math.min(...players.map((player) => player.age))).toBeLessThanOrEqual(20);
    expect(Math.max(...players.map((player) => player.age))).toBeGreaterThanOrEqual(33);
    const strengths = [1, 4].map(
      (tier) =>
        state
          .clubWorld!.filter((club) => club.leagueTier === tier)
          .reduce((sum, club) => sum + getSquadDerivedClubStrength(state, club)!, 0) / 16,
    );
    expect(strengths[0]).toBeGreaterThan(strengths[1]! + 15);
  }, 15_000);
});
