import type { CareerState, Id, PlayerPosition } from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
import { parseProceduralFootballerId } from './proceduralFootballers';
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
  marketExitedFootballers: number;
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
    const ids = resolveEffectiveSeniorSquad(career, club.id, resolve);
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
    marketExitedFootballers: career.worldDelta?.professionalMarketExitCount ?? 0,
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

export interface UnattachedProfessionalAudit {
  total: number;
  currentSeasonGraduates: number;
  olderUnsignedAcademyGraduates: number;
  supplementalPlayers: number;
  formerContractedProfessionals: number;
  otherUnattached: number;
  ageBuckets: Record<string, number>;
  overallBuckets: Record<string, number>;
  unattachedSeasonsKnown: number;
  unattachedSeasonsUnknown: number;
}

/** Development diagnostic for the ephemeral labour pool; it never persists a market snapshot. */
export const auditUnattachedProfessionals = (career: CareerState): UnattachedProfessionalAudit => {
  const attached = new Set(
    (career.clubWorld ?? []).flatMap((club) => resolveEffectiveSeniorSquad(career, club.id)),
  );
  const currentGraduates = new Set(career.worldDelta?.currentGraduateIds ?? []);
  const resolve = createCareerWorldFootballerResolver(career, { cache: true });
  const ids = Object.keys(career.worldDelta?.footballerStateOverrides ?? {}).filter(
    (id) => !attached.has(id) && resolve(id)?.careerStatus === 'active',
  );
  const result: UnattachedProfessionalAudit = {
    total: ids.length,
    currentSeasonGraduates: 0,
    olderUnsignedAcademyGraduates: 0,
    supplementalPlayers: 0,
    formerContractedProfessionals: 0,
    otherUnattached: 0,
    ageBuckets: {},
    overallBuckets: {},
    unattachedSeasonsKnown: 0,
    unattachedSeasonsUnknown: ids.length,
  };
  for (const id of ids) {
    const player = resolve(id)!;
    const origin = parseProceduralFootballerId(id);
    if (currentGraduates.has(id)) result.currentSeasonGraduates++;
    else if (origin?.kind === 'intake') result.olderUnsignedAcademyGraduates++;
    else if (origin?.kind === 'supplemental' || origin?.kind === 'emergency')
      result.supplementalPlayers++;
    else if (player.currentContract) result.formerContractedProfessionals++;
    else result.otherUnattached++;
    const age = getProfileAge(
      player.profile,
      career.currentDate ?? `${career.currentSeason}-07-01`,
    );
    const ageBucket = age <= 20 ? '17-20' : age <= 24 ? '21-24' : age <= 29 ? '25-29' : '30+';
    result.ageBuckets[ageBucket] = (result.ageBuckets[ageBucket] ?? 0) + 1;
    const overall = getPlayerOverall(player.profile, player.profile.primaryPosition);
    const overallBucket =
      overall < 40 ? '<40' : overall < 50 ? '40-49' : overall < 60 ? '50-59' : '60+';
    result.overallBuckets[overallBucket] = (result.overallBuckets[overallBucket] ?? 0) + 1;
  }
  return result;
};

/** @deprecated Squad construction belongs exclusively to processSummerSquadMarket. */
export const processCriticalSquadRepair = (career: CareerState): CareerState => career;
