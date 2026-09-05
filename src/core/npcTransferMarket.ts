import type {
  CareerState,
  Id,
  NpcDepartureReason,
  PlayerPosition,
  ProfessionalClub,
  SquadRole,
  WorldFootballer,
  WorldTransferRecord,
} from '../types/domain';
import { getProfileAge } from './age';
import { estimateNpcMonthlySalary } from './npcTransferEconomics';
import { getPlayerOverall } from './playerOverall';
import { createProceduralFootballerId } from './proceduralFootballers';
import { hashRandomSeed, RandomGenerator } from './random/RandomGenerator';
import { SENIOR_SQUAD_LIMITS } from './worldIntegrity';
import {
  createCareerWorldFootballerResolver,
  emptyWorldDelta,
  resolveEffectiveSeniorSquad,
} from './worldDatabase';

export const SUMMER_SQUAD_TARGET = 24;
export const STABLE_VOLUNTARY_DEPARTURE_CAP = 5;
export const RELEGATED_VOLUNTARY_DEPARTURE_CAP = 10;

export type SummerMarketAvailability = 'free' | 'wants_move' | 'poachable';
export interface SummerMarketEntry {
  playerId: Id;
  availability: SummerMarketAvailability;
  sourceClubId?: Id;
  reason?: NpcDepartureReason;
  priority: number;
}

/** Replaceable hierarchy policy: country/competition ranking can supersede tier later. */
export const compareClubMarketPriority = (a: ProfessionalClub, b: ProfessionalClub) =>
  a.leagueTier - b.leagueTier ||
  b.reputation + (b.strengthRating ?? 50) - (a.reputation + (a.strengthRating ?? 50)) ||
  a.id.localeCompare(b.id);

export const canTargetSummerCandidate = (
  buyer: ProfessionalClub,
  source: ProfessionalClub | undefined,
  availability: SummerMarketAvailability,
) => availability !== 'poachable' || !source || compareClubMarketPriority(buyer, source) < 0;

const desiredPositions: PlayerPosition[] = [
  'goalkeeper',
  'goalkeeper',
  'center_back',
  'center_back',
  'center_back',
  'center_back',
  'left_back',
  'left_back',
  'right_back',
  'right_back',
  'defensive_midfielder',
  'defensive_midfielder',
  'attacking_midfielder',
  'attacking_midfielder',
  'left_winger',
  'left_winger',
  'right_winger',
  'right_winger',
  'striker',
  'striker',
  'striker',
];

const departureCap = (relegated: boolean) =>
  relegated ? RELEGATED_VOLUNTARY_DEPARTURE_CAP : STABLE_VOLUNTARY_DEPARTURE_CAP;

/** Small reusable sporting-concern evaluator; no mutable morale model is introduced. */
export const evaluateNpcMarketIntent = (options: {
  career: CareerState;
  club: ProfessionalClub;
  footballer: WorldFootballer;
  squad: Id[];
  boundaryDate: string;
  relegated?: boolean;
  resolveFootballer?: (id: Id) => WorldFootballer | undefined;
  overallById?: ReadonlyMap<Id, number>;
  positionById?: ReadonlyMap<Id, PlayerPosition>;
}): { wantsMove: boolean; reason?: NpcDepartureReason; score: number } => {
  const { career, club, footballer, squad, boundaryDate, relegated = false } = options;
  if (footballer.currentContract && footballer.currentContract.endDate < boundaryDate)
    return { wantsMove: true, reason: 'contract_expired', score: 100 };
  const overall =
    options.overallById?.get(footballer.profile.id) ??
    getPlayerOverall(footballer.profile, footballer.profile.primaryPosition);
  const positionalRank = squad
    .map((id) =>
      id === footballer.profile.id
        ? overall
        : (() => {
            const teammate = (
              options.resolveFootballer ?? createCareerWorldFootballerResolver(career)
            )(id);
            return (options.positionById?.get(id) ?? teammate?.profile.primaryPosition) ===
              footballer.profile.primaryPosition
              ? (options.overallById?.get(id) ??
                  (teammate
                    ? getPlayerOverall(teammate.profile, teammate.profile.primaryPosition)
                    : -1))
              : -1;
          })(),
    )
    .filter((value) => value > overall).length;
  const ambition = footballer.profile.attributes.ambition;
  const professionalism = footballer.profile.attributes.professionalism;
  const age = getProfileAge(footballer.profile, boundaryDate);
  const roleMismatch = positionalRank >= 2 && overall >= (club.strengthRating ?? 50) - 2;
  const levelMismatch = overall >= (club.strengthRating ?? 50) + 9;
  const seed = `${career.seed}:market-intent:${boundaryDate}:${footballer.profile.id}`;
  const score =
    (roleMismatch ? 30 : 0) +
    (levelMismatch ? 23 : 0) +
    (relegated ? 18 : 0) +
    (ambition - 50) * 0.35 +
    (professionalism - 50) * 0.08 +
    (age >= 24 && age <= 31 ? 5 : 0) +
    RandomGenerator.fromSeed(seed).int(-10, 10);
  const reason: NpcDepartureReason | undefined = roleMismatch
    ? 'role_frustration'
    : relegated && overall >= (club.strengthRating ?? 50) - 3
      ? 'relegation'
      : levelMismatch
        ? 'club_level_mismatch'
        : undefined;
  return { wantsMove: Boolean(reason) && score >= 27, ...(reason ? { reason } : {}), score };
};

const roleFor = (
  player: WorldFootballer,
  club: ProfessionalClub,
  boundaryDate: string,
): SquadRole => {
  const overall = getPlayerOverall(player.profile, player.profile.primaryPosition);
  return overall >= (club.strengthRating ?? 50) + 5
    ? 'important_player'
    : getProfileAge(player.profile, boundaryDate) <= 21
      ? 'development_player'
      : 'rotation';
};

/** One owner for expiry, intent, graduates, transfers, cascading recruitment and viability. */
export const processSummerSquadMarket = (
  career: CareerState,
  boundaryDate: string,
  relegatedClubIds: ReadonlySet<Id> = new Set(),
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  const source = career.worldDelta ?? emptyWorldDelta();
  if ((source.npcTransferMarketProcessedThroughSeason ?? -1) >= season) return career;
  const delta = {
    ...source,
    squadOverrides: { ...source.squadOverrides },
    footballerStateOverrides: { ...source.footballerStateOverrides },
  };
  const clubs = [...(career.clubWorld ?? [])].sort(compareClubMarketPriority);
  const byId = new Map(clubs.map((club) => [club.id, club]));
  const marketCareer = { ...career, currentDate: boundaryDate, worldDelta: delta };
  const resolve = createCareerWorldFootballerResolver(marketCareer, { cache: true });
  const squads = new Map(
    clubs.map((club) => [club.id, resolveEffectiveSeniorSquad(marketCareer, club.id, resolve)]),
  );
  const membership = new Map<Id, Id>();
  for (const [clubId, ids] of squads)
    for (const id of ids) if (id !== career.player.id) membership.set(id, clubId);
  const activeStart = membership.size;
  const overallById = new Map<Id, number>();
  const positionById = new Map<Id, PlayerPosition>();
  for (const id of membership.keys()) {
    const player = resolve(id);
    if (!player) continue;
    positionById.set(id, player.profile.primaryPosition);
    overallById.set(id, getPlayerOverall(player.profile, player.profile.primaryPosition));
  }
  const retiredBefore = source.retiredFootballerIds.length;
  const entries = new Map<Id, SummerMarketEntry>();
  let expiryCount = 0;
  let wantsMoveCount = 0;
  const outgoing = new Map<Id, number>();

  // Phase A: guaranteed expiry/non-renewal first, then bounded sporting intent.
  for (const club of clubs) {
    const squad = squads.get(club.id)!;
    const voluntary: Array<{ id: Id; reason: NpcDepartureReason; score: number }> = [];
    for (const id of squad) {
      if (id === career.player.id) continue;
      const player = resolve(id);
      if (!player) continue;
      if (player.currentContract && player.currentContract.endDate < boundaryDate) {
        const renewal = RandomGenerator.fromSeed(
          `${career.seed}:npc-renewal:${season}:${club.id}:${id}`,
        ).bool(getProfileAge(player.profile, boundaryDate) >= 34 ? 0.62 : 0.86);
        if (renewal) {
          delta.footballerStateOverrides[id] = {
            currentClubId: club.id,
            currentContract: {
              ...player.currentContract,
              startDate: boundaryDate,
              endDate: `${season + 3}-06-30`,
            },
          };
          continue;
        }
      }
      const intent = evaluateNpcMarketIntent({
        career: marketCareer,
        club,
        footballer: player,
        squad,
        boundaryDate,
        relegated: relegatedClubIds.has(club.id),
        resolveFootballer: resolve,
        overallById,
        positionById,
      });
      if (intent.reason === 'contract_expired') {
        const reason: NpcDepartureReason = RandomGenerator.fromSeed(
          `${career.seed}:npc-non-renewal-reason:${season}:${id}`,
        ).bool(0.5)
          ? 'non_renewal'
          : 'failed_renewal';
        entries.set(id, {
          playerId: id,
          availability: 'free',
          reason,
          priority: 1000,
        });
        squads.set(
          club.id,
          squads.get(club.id)!.filter((candidate) => candidate !== id),
        );
        membership.delete(id);
        delta.footballerStateOverrides[id] = { currentClubId: null, currentContract: null };
        expiryCount++;
      } else if (intent.wantsMove && intent.reason)
        voluntary.push({ id, reason: intent.reason, score: intent.score });
    }
    voluntary.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    for (const item of voluntary.slice(0, departureCap(relegatedClubIds.has(club.id)))) {
      entries.set(item.id, {
        playerId: item.id,
        availability: 'wants_move',
        sourceClubId: club.id,
        reason: item.reason,
        priority: item.score,
      });
      wantsMoveCount++;
    }
  }
  for (const id of delta.currentGraduateIds ?? [])
    if (resolve(id) && !membership.has(id))
      entries.set(id, { playerId: id, availability: 'free', priority: 90 });
  for (const id of Object.keys(delta.footballerStateOverrides)) {
    const player = resolve(id);
    if (player?.careerStatus === 'active' && !membership.has(id))
      entries.set(id, {
        playerId: id,
        availability: 'free',
        priority: entries.get(id)?.priority ?? 50,
      });
  }
  const records = [...(delta.npcTransferRecords ?? [])];
  const recordIds = new Set(records.map((record) => record.id));
  let freeSignings = 0,
    transfers = 0,
    supplemental = 0,
    graduatesUsed = 0;

  const needPosition = (ids: Id[]): PlayerPosition => {
    const counts = new Map<PlayerPosition, number>();
    for (const id of ids) {
      const p = resolve(id)?.profile.primaryPosition;
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    if ((counts.get('goalkeeper') ?? 0) < 2) return 'goalkeeper';
    return desiredPositions.reduce(
      (best, p) => ((counts.get(p) ?? 0) < (counts.get(best) ?? 0) ? p : best),
      desiredPositions[0]!,
    );
  };
  for (const club of clubs) {
    while ((squads.get(club.id)?.length ?? 0) < SUMMER_SQUAD_TARGET) {
      const squad = squads.get(club.id)!;
      const needed = needPosition(squad);
      const goalkeeperRequired =
        squad.filter((id) => resolve(id)?.profile.primaryPosition === 'goalkeeper').length < 2;
      const fillsRequiredPosition = (entry: SummerMarketEntry) =>
        !goalkeeperRequired || resolve(entry.playerId)?.profile.primaryPosition === 'goalkeeper';
      // Existing free agents always precede transfers and generation.
      const freeCandidates = [...entries.values()].filter(
        (entry) => entry.availability === 'free' && fillsRequiredPosition(entry),
      );
      const listedCandidates = [...entries.values()].filter(
        (entry) => entry.availability === 'wants_move' && fillsRequiredPosition(entry),
      );
      const candidates: SummerMarketEntry[] = freeCandidates.length
        ? freeCandidates
        : listedCandidates.length
          ? listedCandidates
          : [...membership]
              .filter(([id, sourceClubId]) => sourceClubId !== club.id && !entries.has(id))
              .map(([playerId, sourceClubId]) => ({
                playerId,
                availability: 'poachable' as const,
                sourceClubId,
                priority: 0,
              }))
              .filter(fillsRequiredPosition);
      const ranked = candidates
        .filter((entry) => {
          const sourceClub = entry.sourceClubId ? byId.get(entry.sourceClubId) : undefined;
          const player = resolve(entry.playerId);
          return (
            (player && !membership.has(entry.playerId)) ||
            Boolean(
              player &&
                sourceClub &&
                membership.get(entry.playerId) !== club.id &&
                canTargetSummerCandidate(club, sourceClub, entry.availability) &&
                (outgoing.get(sourceClub.id) ?? 0) <
                  departureCap(relegatedClubIds.has(sourceClub.id)) &&
                (squads.get(sourceClub.id)?.length ?? 0) > SENIOR_SQUAD_LIMITS.healthy,
            )
          );
        })
        .map((entry) => {
          const player = resolve(entry.playerId)!;
          const positional = player.profile.primaryPosition === needed ? 24 : 0;
          const free = entry.availability === 'free' ? 1000 : 0;
          const ownGraduate =
            (delta.currentGraduateIds ?? []).includes(entry.playerId) &&
            entry.playerId.includes(`_${club.id}_`)
              ? 35
              : 0;
          return {
            entry,
            player,
            score:
              free +
              positional +
              ownGraduate +
              getPlayerOverall(player.profile, player.profile.primaryPosition) -
              Math.abs(
                getPlayerOverall(player.profile, player.profile.primaryPosition) -
                  (club.strengthRating ?? 50),
              ) *
                0.25 +
              RandomGenerator.fromSeed(
                `${career.seed}:summer-fit:${season}:${club.id}:${entry.playerId}`,
              ).int(-5, 5),
          };
        })
        .sort((a, b) => b.score - a.score || a.entry.playerId.localeCompare(b.entry.playerId));
      let chosen = ranked[0];
      if (!chosen) {
        const id = createProceduralFootballerId({
          kind: 'supplemental',
          ownerId: club.id,
          season: season + 1,
          position: needed,
          slot: supplemental,
        });
        chosen = {
          entry: { playerId: id, availability: 'free', priority: 0 },
          player: resolve(id)!,
          score: 0,
        };
        supplemental++;
      }
      const id = chosen.entry.playerId;
      const from = membership.get(id);
      if (from) {
        squads.set(
          from,
          squads.get(from)!.filter((candidate) => candidate !== id),
        );
        outgoing.set(from, (outgoing.get(from) ?? 0) + 1);
        transfers++;
      } else {
        freeSignings++;
        if ((delta.currentGraduateIds ?? []).includes(id)) graduatesUsed++;
      }
      membership.set(id, club.id);
      entries.delete(id);
      squads.set(club.id, [...squad, id]);
      const role = roleFor(chosen.player, club, boundaryDate);
      const contractEndDate = `${season + 3}-06-30`;
      delta.footballerStateOverrides[id] = {
        currentClubId: club.id,
        currentContract: {
          clubId: club.id,
          startDate: boundaryDate,
          endDate: contractEndDate,
          monthlySalary: estimateNpcMonthlySalary(chosen.player, club, role, boundaryDate),
          signingBonus: 0,
          squadRole: role,
          contractType: role === 'development_player' ? 'development' : 'professional',
        },
      };
      const record: WorldTransferRecord = {
        id: `n:${season}:${hashRandomSeed(`summer-market:${season}:${id}:${club.id}`).toString(36)}`,
        playerId: id,
        date: boundaryDate,
        ...(from ? { fromClubId: from } : {}),
        toClubId: club.id,
        contractEndDate,
      };
      if (!recordIds.has(record.id)) {
        records.push(record);
        recordIds.add(record.id);
      }
    }
  }
  for (const [clubId, ids] of squads)
    delta.squadOverrides[clubId] = [...new Set(ids)].slice(0, SENIOR_SQUAD_LIMITS.hardMaximum);
  // The market pool is ephemeral. Unattached candidates have lost the competition for one of the
  // finite professional jobs; retain reconstructible identity data and only a cumulative counter.
  let marketExits = 0;
  for (const entry of entries.values()) {
    if (membership.has(entry.playerId) || entry.availability === 'wants_move') continue;
    delete delta.footballerStateOverrides[entry.playerId];
    marketExits++;
  }
  delta.professionalMarketExitCount = (delta.professionalMarketExitCount ?? 0) + marketExits;
  delta.currentGraduateIds = [];
  delta.npcTransferRecords = records;
  delta.npcTransferMarketProcessedThroughSeason = season;
  const sizes = [...squads.values()].map((ids) => ids.length);
  const counts = new Map<Id, number>();
  for (const ids of squads.values())
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  const unfieldable = [...squads.entries()].filter(
    ([, ids]) =>
      ids.length < 11 || !ids.some((id) => resolve(id)?.profile.primaryPosition === 'goalkeeper'),
  ).length;
  delta.summerMarketDiagnostics = {
    season,
    activeProfessionalsStart: activeStart,
    activeProfessionalsEnd: new Set([...squads.values()].flat()).size,
    retirees: Math.max(0, delta.retiredFootballerIds.length - retiredBefore),
    contractExpiryFreeAgents: expiryCount,
    wantsMovePlayers: wantsMoveCount,
    graduatesEnteringSeniorFootball: graduatesUsed,
    freeAgentSignings: freeSignings,
    interClubTransfers: transfers,
    supplementalGeneratedProfessionals: supplemental,
    marketExits,
    unresolvedFreeAgents: 0,
    minSquadSize: Math.min(...sizes),
    meanSquadSize: sizes.reduce((a, b) => a + b, 0) / sizes.length,
    maxSquadSize: Math.max(...sizes),
    clubsBelowTarget: sizes.filter((n) => n < SUMMER_SQUAD_TARGET).length,
    clubsUnfieldable: unfieldable,
    duplicateMemberships: [...counts.values()].filter((n) => n > 1).length,
  };
  return { ...career, worldDelta: delta };
};

/** @deprecated The canonical owner is processSummerSquadMarket. */
export const processNpcTransferMarket = processSummerSquadMarket;
