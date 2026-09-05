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
  getTacticalFit,
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
    expect(first.bench.filter((item) => item.position === 'goalkeeper')).toHaveLength(1);
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
    const players = Object.values(state.footballerWorld!).filter(
      (player) => player.currentContract,
    );
    const salaries = players.map((player) => player.currentContract!.monthlySalary);
    expect(new Set(salaries).size).toBeGreaterThan(200);
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
    expect(xi.assignments.map((item) => item.slotIndex)).toEqual(
      FORMATIONS[formation].map((_, index) => index),
    );
    for (const item of xi.assignments)
      expect(item.effectiveOverall).toBe(
        getEffectivePositionOverall(resolveFootballer(state, item.footballerId)!, item.position),
      );
    expect(getSquadDerivedClubStrength(state, club)).toBe(
      Math.round(xi.assignments.reduce((sum, item) => sum + item.effectiveOverall, 0) / 11),
    );
  });

  it.each(['4-4-2', '3-5-2'] as const)(
    'preserves canonical slot identity for duplicate positions in %s',
    (formation) => {
      const state = career();
      const club = state.clubWorld![0]!;
      const hierarchy = deriveSquadHierarchy(state, club, formation);
      expect(hierarchy.preferredXI.map((item) => item.position)).toEqual(FORMATIONS[formation]);
      expect(hierarchy.preferredXI.map((item) => item.slotIndex)).toEqual(
        FORMATIONS[formation].map((_, index) => index),
      );
    },
  );

  it('keeps goalkeepers and outfield players on their side of the normal-selection boundary', () => {
    const state = career();
    const club = state.clubWorld![0]!;
    for (const selection of [
      selectBestXI(state, club, '4-4-2').assignments,
      deriveSquadHierarchy(state, club, '4-4-2').preferredXI,
      deriveSquadHierarchy(state, club, '4-4-2').bench,
    ]) {
      for (const assignment of selection) {
        const player = resolveFootballer(state, assignment.footballerId)!;
        expect(player.primaryPosition === 'goalkeeper').toBe(assignment.position === 'goalkeeper');
      }
    }
  });

  it('falls back from an infeasible preferred shape and never exposes illegal assignments', () => {
    const state = career();
    const source = state.clubWorld![0]!;
    const squadPlayerIds = source.squadPlayerIds!.filter((id) => {
      const position = resolveFootballer(state, id)!.primaryPosition;
      return position !== 'left_winger' && position !== 'right_winger';
    });
    const club = { ...source, squadPlayerIds };
    const hierarchy = deriveSquadHierarchy(state, club, '4-3-3');
    expect(hierarchy.formation).not.toBe('4-3-3');
    expect(hierarchy.preferredXI).toHaveLength(11);
    expect(new Set(hierarchy.preferredXI.map(({ footballerId }) => footballerId)).size).toBe(11);
    for (const assignment of hierarchy.preferredXI) {
      const player = resolveFootballer(state, assignment.footballerId)!;
      expect(player.positionFamiliarity[assignment.position]).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('hard-excludes fitness below 55 and bounds tactical fit', () => {
    const state = career();
    state.player.fitness = 54;
    const source = state.clubWorld![0]!;
    const club = { ...source, squadPlayerIds: [...source.squadPlayerIds!, state.player.id] };
    expect(
      deriveSquadHierarchy(state, club).preferredXI.map(({ footballerId }) => footballerId),
    ).not.toContain(state.player.id);
    for (const id of source.squadPlayerIds!.slice(0, 12)) {
      expect(
        Math.abs(getTacticalFit(resolveFootballer(state, id)!, source.managerId)),
      ).toBeLessThanOrEqual(2);
    }
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
