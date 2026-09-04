import type { CareerState, Id, PlayerPosition } from '../types/domain';
import { createProceduralFootballerId } from './proceduralFootballers';
import { createCareerWorldFootballerResolver, emptyWorldDelta } from './worldDatabase';

export const SENIOR_SQUAD_LIMITS = {
  playable: 11,
  playableGoalkeepers: 1,
  playableOutfield: 10,
  healthy: 18,
  healthyGoalkeepers: 2,
  hardMaximum: 30,
} as const;

export interface WorldPopulationAudit {
  activeSeniorFootballers: number;
  activeUnattachedSeniorFootballers: number;
  retiredFootballers: number;
  minSquadSize: number;
  meanSquadSize: number;
  maxSquadSize: number;
  clubsBelow18: number;
  clubsBelow11: number;
  clubsWithoutGoalkeeper: number;
  clubsWithoutTenOutfield: number;
  duplicateActiveSeniorMemberships: number;
  ordinaryNpcTransfers: number;
  criticalRepairSignings: number;
}

const positionOf = (
  career: CareerState,
  resolve: ReturnType<typeof createCareerWorldFootballerResolver>,
  id: Id,
): PlayerPosition | undefined =>
  id === career.player.id ? career.player.primaryPosition : resolve(id)?.profile.primaryPosition;

export const auditSeniorWorld = (career: CareerState): WorldPopulationAudit => {
  const resolve = createCareerWorldFootballerResolver(
    { ...career, currentDate: undefined },
    { cache: true },
  );
  const memberships = new Map<Id, number>();
  const sizes: number[] = [];
  let withoutGoalkeeper = 0;
  let withoutTenOutfield = 0;
  for (const club of career.clubWorld ?? []) {
    const ids = [
      ...new Set(career.worldDelta?.squadOverrides[club.id] ?? club.squadPlayerIds ?? []),
    ].filter((id) => id === career.player.id || resolve(id));
    sizes.push(ids.length);
    const goalkeepers = ids.filter((id) => positionOf(career, resolve, id) === 'goalkeeper').length;
    if (!goalkeepers) withoutGoalkeeper++;
    if (ids.length - goalkeepers < SENIOR_SQUAD_LIMITS.playableOutfield) withoutTenOutfield++;
    for (const id of ids) memberships.set(id, (memberships.get(id) ?? 0) + 1);
  }
  const attached = new Set(memberships.keys());
  const stateIds = Object.keys(career.worldDelta?.footballerStateOverrides ?? {});
  return {
    activeSeniorFootballers: attached.size,
    activeUnattachedSeniorFootballers: stateIds.filter(
      (id) => !attached.has(id) && resolve(id)?.careerStatus === 'active',
    ).length,
    retiredFootballers: career.worldDelta?.retiredFootballerIds.length ?? 0,
    minSquadSize: sizes.length ? Math.min(...sizes) : 0,
    meanSquadSize: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0,
    maxSquadSize: sizes.length ? Math.max(...sizes) : 0,
    clubsBelow18: sizes.filter((size) => size < SENIOR_SQUAD_LIMITS.healthy).length,
    clubsBelow11: sizes.filter((size) => size < SENIOR_SQUAD_LIMITS.playable).length,
    clubsWithoutGoalkeeper: withoutGoalkeeper,
    clubsWithoutTenOutfield: withoutTenOutfield,
    duplicateActiveSeniorMemberships: [...memberships.values()].filter((count) => count > 1).length,
    ordinaryNpcTransfers: career.worldDelta?.npcTransferRecords?.length ?? 0,
    criticalRepairSignings: career.worldDelta?.criticalSquadRepairRecords?.length ?? 0,
  };
};

/** Minimal deterministic safety net. It only runs for an unfieldable club and never ranks by OVR. */
export const processCriticalSquadRepair = (
  career: CareerState,
  boundaryDate: string,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  const source = career.worldDelta ?? emptyWorldDelta();
  if ((source.squadRepairProcessedThroughSeason ?? -1) >= season) return career;
  const delta = {
    ...source,
    squadOverrides: { ...source.squadOverrides },
    footballerStateOverrides: { ...source.footballerStateOverrides },
  };
  const resolve = createCareerWorldFootballerResolver(
    { ...career, currentDate: undefined, worldDelta: delta },
    { cache: true },
  );
  const membership = new Set<Id>();
  for (const club of career.clubWorld ?? [])
    for (const id of delta.squadOverrides[club.id] ?? club.squadPlayerIds ?? []) membership.add(id);
  const available = [
    ...Object.keys(delta.footballerStateOverrides),
    ...(delta.currentGraduateIds ?? []),
  ]
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .filter((id) => !membership.has(id) && resolve(id)?.careerStatus === 'active')
    .sort();
  membership.clear();
  const records = [...(delta.criticalSquadRepairRecords ?? [])];
  for (const club of [...(career.clubWorld ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const original = delta.squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
    let squad = [...new Set(original)].filter(
      (id) => !membership.has(id) && (id === career.player.id || resolve(id)),
    );
    for (const id of squad) membership.add(id);
    if (squad.length > SENIOR_SQUAD_LIMITS.hardMaximum)
      squad = squad.slice(0, SENIOR_SQUAD_LIMITS.hardMaximum);
    const countGk = () =>
      squad.filter((id) => positionOf(career, resolve, id) === 'goalkeeper').length;
    const invalid = squad.length < 11 || countGk() < 1 || squad.length - countGk() < 10;
    if (invalid) {
      let slot = 0;
      while (
        squad.length < SENIOR_SQUAD_LIMITS.healthy ||
        countGk() < SENIOR_SQUAD_LIMITS.healthyGoalkeepers ||
        squad.length - countGk() < SENIOR_SQUAD_LIMITS.playableOutfield
      ) {
        const needed: PlayerPosition =
          countGk() < SENIOR_SQUAD_LIMITS.healthyGoalkeepers ? 'goalkeeper' : 'center_back';
        const candidateIndex = available.findIndex(
          (id) => positionOf(career, resolve, id) === needed,
        );
        const id =
          candidateIndex >= 0
            ? available.splice(candidateIndex, 1)[0]!
            : createProceduralFootballerId({
                kind: 'emergency',
                ownerId: club.id,
                season: season + 1,
                position: needed,
                slot: slot++,
              });
        if (membership.has(id)) continue;
        const contractEndDate = `${season + 3}-06-30`;
        delta.footballerStateOverrides[id] = {
          currentClubId: club.id,
          currentContract: {
            clubId: club.id,
            startDate: boundaryDate,
            endDate: contractEndDate,
            monthlySalary: 1500,
            signingBonus: 0,
            squadRole: 'development_player',
            contractType: 'professional',
          },
        };
        squad.push(id);
        membership.add(id);
        records.push({
          id: `critical-repair:${season}:${id}:${club.id}`,
          playerId: id,
          date: boundaryDate,
          toClubId: club.id,
          transferType: 'free',
          fee: 0,
          contractEndDate,
        });
      }
    }
    if (squad.length !== original.length || squad.some((id, index) => id !== original[index]))
      delta.squadOverrides[club.id] = squad;
  }
  delta.criticalSquadRepairRecords = records;
  delta.squadRepairProcessedThroughSeason = season;
  return { ...career, worldDelta: delta };
};
