import type { CareerState, Id, PlayerPosition } from '../types/domain';
import { createCareerWorldFootballerResolver, resolveEffectiveSeniorSquad } from './worldDatabase';

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
    const ids = resolveEffectiveSeniorSquad(career, club.id);
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

/** @deprecated Squad construction belongs exclusively to processSummerSquadMarket. */
export const processCriticalSquadRepair = (career: CareerState): CareerState => career;
