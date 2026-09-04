import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type {
  CareerState,
  Id,
  PlayerPosition,
  ProfessionalClub,
  SquadRole,
  WorldTransferRecord,
} from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
import {
  deriveClubFinancialCapacity,
  deriveCommittedMonthlyWages,
  estimateNpcMonthlySalary,
  estimateNpcTransferValue,
} from './npcTransferEconomics';
import { RandomGenerator } from './random/RandomGenerator';
import {
  createCareerWorldFootballerResolver,
  emptyWorldDelta,
  resolveYouthCohort,
} from './worldDatabase';

const unitFor = (position: PlayerPosition): keyof ProfessionalClub['positionalNeeds'] =>
  position === 'goalkeeper'
    ? 'goalkeeper'
    : ['center_back', 'left_back', 'right_back'].includes(position)
      ? 'defense'
      : ['striker', 'right_winger'].includes(position)
        ? 'attack'
        : 'midfield';

/**
 * A deliberately noisy and bounded summer pass. Each club sees only a stable slice of the
 * candidate pool, so this is circulation and vacancy repair rather than a global optimizer.
 */
export const processNpcTransferMarket = (
  career: CareerState,
  boundaryDate: string,
  reuseOwnedDeltaMaps = false,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcTransferMarketProcessedThroughSeason ?? -1) >= season) return career;
  const clubs = career.clubWorld ?? [];
  const footballerStateOverrides = reuseOwnedDeltaMaps
    ? (delta.footballerStateOverrides ?? {})
    : { ...delta.footballerStateOverrides };
  const squadOverrides = reuseOwnedDeltaMaps ? delta.squadOverrides : { ...delta.squadOverrides };
  const resolveFootballer = createCareerWorldFootballerResolver(
    {
      ...career,
      currentDate: boundaryDate,
      worldDelta: { ...delta, footballerStateOverrides },
    },
    { cache: true },
  );
  const retired = new Set(delta.retiredFootballerIds);
  const youth = new Set<Id>();
  for (const team of getPolishU17TeamDefinitions(clubs)) {
    for (const id of resolveYouthCohort(career, getYouthCohortKey(team.id, season)) ?? [])
      youth.add(id);
  }
  const squads = new Map(
    clubs.map((club) => [club.id, [...(squadOverrides[club.id] ?? club.squadPlayerIds ?? [])]]),
  );
  const membership = new Map<Id, Id>();
  for (const [clubId, ids] of squads)
    for (const id of ids) if (id !== career.player.id) membership.set(id, clubId);
  const orderedClubs = [...clubs].sort((a, b) => a.id.localeCompare(b.id));
  const activeStart = orderedClubs.length
    ? RandomGenerator.fromSeed(`${career.seed}:npc-market-active:${season}`).int(
        0,
        orderedClubs.length - 1,
      )
    : 0;
  const candidateIds: Id[] = [];
  const seenCandidates = new Set<Id>();
  const include = (id: Id) => {
    const player = resolveFootballer(id);
    if (
      seenCandidates.has(id) ||
      id === career.player.id ||
      retired.has(id) ||
      youth.has(id) ||
      !player ||
      player.careerStatus !== 'active'
    )
      return;
    seenCandidates.add(id);
    candidateIds.push(id);
  };
  // A rotating scouting slice prevents every club from inspecting the entire world.
  for (let index = 0; index < Math.min(6, orderedClubs.length); index++) {
    const source = orderedClubs[(activeStart + index * 7) % orderedClubs.length]!;
    for (const id of squads.get(source.id) ?? []) include(id);
  }
  // Detached players necessarily live in sparse state. A bounded window keeps old careers cheap.
  let inspectedOverrides = 0;
  for (const id in footballerStateOverrides) {
    if (inspectedOverrides++ >= 96) break;
    if (!membership.has(id) && !footballerStateOverrides[id]!.currentClubId) include(id);
  }
  for (const id in delta.footballerOverrides) {
    if (inspectedOverrides++ >= 96) break;
    if (!membership.has(id) && !resolveFootballer(id)?.currentClubId) include(id);
  }
  for (const id of delta.currentGraduateIds ?? []) if (!membership.has(id)) include(id);
  for (const id in delta.newFootballers)
    if (!membership.has(id) && !delta.newFootballers[id]!.currentClubId) include(id);
  const candidates = candidateIds.map((id) => [id, resolveFootballer(id)!] as const);
  const unattachedCandidates = candidates.filter(([id]) => !membership.has(id));
  const moved = new Set<Id>();
  const outgoing = new Map<Id, number>();
  const records = [...(delta.npcTransferRecords ?? [])];
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const ledgers = new Map<
    Id,
    {
      startingTransferBudget: number;
      feesSpent: number;
      feesReceived: number;
      startingWageCommitment: number;
      wagesAdded: number;
      wagesRemoved: number;
      monthlyWageBudget: number;
    }
  >();
  const getLedger = (club: ProfessionalClub) => {
    const existing = ledgers.get(club.id);
    if (existing) return existing;
    const capacity = deriveClubFinancialCapacity(club, career.seed, season);
    const created = {
      startingTransferBudget: capacity.transferBudget,
      feesSpent: 0,
      feesReceived: 0,
      startingWageCommitment: deriveCommittedMonthlyWages(
        squads.get(club.id) ?? [],
        resolveFootballer,
        boundaryDate,
      ),
      wagesAdded: 0,
      wagesRemoved: 0,
      monthlyWageBudget: capacity.monthlyWageBudget,
    };
    ledgers.set(club.id, created);
    return created;
  };
  // Phase 1 deliberately activates only a rotating handful of buyers each summer.
  const activeClubs = Array.from(
    { length: Math.min(3, orderedClubs.length) },
    (_, index) => orderedClubs[(activeStart + index * 13) % orderedClubs.length]!,
  );
  for (const club of activeClubs) {
    const rng = RandomGenerator.fromSeed(`${career.seed}:npc-market:${season}:${club.id}`);
    const attempts = rng.bool(0.38) ? rng.int(1, 3) : 0;
    if (!attempts || !candidates.length) continue;
    const start = rng.int(0, candidates.length - 1);
    const sampled = Array.from(
      { length: Math.min(6, candidates.length) },
      (_, i) => candidates[(start + i * 17) % candidates.length]!,
    );
    const freeStart = unattachedCandidates.length ? rng.int(0, unattachedCandidates.length - 1) : 0;
    const shortlist = [
      ...Array.from(
        { length: Math.min(2, unattachedCandidates.length) },
        (_, index) => unattachedCandidates[(freeStart + index) % unattachedCandidates.length]!,
      ),
      ...sampled,
    ];
    const considered = new Set<Id>();
    for (let incoming = 0; incoming < attempts; incoming++) {
      if (!rng.bool(0.66)) continue;
      const destinationSquad = squads.get(club.id) ?? [];
      if (destinationSquad.length >= 30) break;
      const ranked = shortlist
        .filter(
          ([id]) =>
            !moved.has(id) &&
            !considered.has(id) &&
            membership.get(id) !== club.id &&
            (outgoing.get(membership.get(id) ?? '') ?? 0) < 2,
        )
        .map(([id, player]) => {
          const position = player.profile.primaryPosition;
          const need = club.positionalNeeds[unitFor(position)];
          const ovr = getPlayerOverall(player.profile, position);
          const age = getProfileAge(player.profile, boundaryDate, `${season}-07-01`);
          const potential = Math.max(...Object.values(player.developmentProfile.familyCapacity));
          const noise = RandomGenerator.fromSeed(
            `${career.seed}:npc-fit:${season}:${club.id}:${id}`,
          ).int(-22, 22);
          return {
            id,
            player,
            score:
              need.needLevel * 0.3 +
              ovr * 0.55 +
              potential * (age <= 23 ? 0.12 : 0.03) -
              Math.abs((club.strengthRating ?? 50) - ovr) * 0.18 +
              noise,
          };
        })
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
      const selected = ranked[0];
      if (!selected) break;
      considered.add(selected.id);
      const sourceId = membership.get(selected.id);
      const sourceClub = sourceId ? clubById.get(sourceId) : undefined;
      const sourceContract = selected.player.currentContract;
      const contractedSourceId =
        sourceId &&
        sourceContract &&
        sourceContract.startDate <= boundaryDate &&
        sourceContract.endDate >= boundaryDate
          ? sourceId
          : undefined;
      const role: SquadRole =
        selected.score > 65
          ? 'first_team_competition'
          : getProfileAge(selected.player.profile, boundaryDate, `${season}-07-01`) <= 21
            ? 'development_player'
            : 'rotation';
      const salary = estimateNpcMonthlySalary(selected.player, club, role, boundaryDate);
      const value = estimateNpcTransferValue(selected.player, {
        boundaryDate,
        sourceClub,
        destinationClub: club,
      });
      const valuationNoise = RandomGenerator.fromSeed(
        `${career.seed}:npc-fee:${season}:${club.id}:${selected.id}`,
      ).float();
      const fee = contractedSourceId
        ? Math.max(5_000, Math.round((value * (0.88 + valuationNoise * 0.24)) / 5_000) * 5_000)
        : 0;
      const buyerLedger = getLedger(club);
      const returnedIncome = buyerLedger.feesReceived * 0.7;
      if (fee > buyerLedger.startingTransferBudget + returnedIncome - buyerLedger.feesSpent)
        continue;
      const wageTolerance =
        1.02 +
        RandomGenerator.fromSeed(`${career.seed}:npc-wage-stretch:${season}:${club.id}`).float() *
          0.06;
      const buyerWages =
        buyerLedger.startingWageCommitment + buyerLedger.wagesAdded - buyerLedger.wagesRemoved;
      if (buyerWages + salary > buyerLedger.monthlyWageBudget * wageTolerance) continue;
      if (contractedSourceId && sourceClub) {
        const sourceSquad = squads.get(contractedSourceId) ?? [];
        const sourceLedger = getLedger(sourceClub);
        const oldSalary = selected.player.currentContract?.monthlySalary ?? 0;
        const important = ['important_player', 'star_player'].includes(
          selected.player.currentContract?.squadRole ?? '',
        );
        const sameUnitDepth = sourceSquad.filter((id) => {
          const teammate = resolveFootballer(id);
          return (
            teammate &&
            unitFor(teammate.profile.primaryPosition) ===
              unitFor(selected.player.profile.primaryPosition)
          );
        }).length;
        const shortContract =
          (selected.player.currentContract?.endDate ?? boundaryDate) <=
          `${Number(boundaryDate.slice(0, 4)) + 1}-06-30`;
        const surplus =
          sameUnitDepth >= 7 || selected.player.currentContract?.squadRole === 'development_player';
        const sellerNoise = RandomGenerator.fromSeed(
          `${career.seed}:npc-seller:${season}:${sourceId}:${club.id}:${selected.id}`,
        );
        const offerRatio = value ? fee / value : 1;
        const acceptance =
          0.62 +
          (surplus ? 0.3 : 0) +
          (shortContract ? 0.22 : 0) +
          Math.max(0, offerRatio - 0.9) * 0.35 -
          (important ? 0.58 : 0) -
          (sameUnitDepth <= 3 ? 0.35 : 0);
        if (!sellerNoise.bool(Math.max(0.03, Math.min(0.94, acceptance)))) continue;
        sourceLedger.feesReceived += fee;
        sourceLedger.wagesRemoved += oldSalary;
      }
      if (sourceId) {
        squads.set(
          sourceId,
          (squads.get(sourceId) ?? []).filter((id) => id !== selected.id),
        );
        outgoing.set(sourceId, (outgoing.get(sourceId) ?? 0) + 1);
      }
      squads.set(club.id, [...destinationSquad.filter((id) => id !== selected.id), selected.id]);
      membership.set(selected.id, club.id);
      moved.add(selected.id);
      buyerLedger.feesSpent += fee;
      buyerLedger.wagesAdded += salary;
      const contractEndDate = `${Number(boundaryDate.slice(0, 4)) + rng.int(1, 3)}-06-30`;
      footballerStateOverrides[selected.id] = {
        currentClubId: club.id,
        currentContract: {
          clubId: club.id,
          startDate: boundaryDate,
          endDate: contractEndDate,
          monthlySalary: salary,
          signingBonus: 0,
          squadRole: role,
          contractType: role === 'development_player' ? 'development' : 'professional',
        },
      };
      const record: WorldTransferRecord = {
        id: `npc-transfer:${season}:${selected.id}:${club.id}`,
        playerId: selected.id,
        date: boundaryDate,
        ...(contractedSourceId ? { fromClubId: contractedSourceId } : {}),
        toClubId: club.id,
        transferType: contractedSourceId ? 'transfer' : 'free',
        fee,
        contractEndDate,
      };
      if (!records.some((item) => item.id === record.id)) records.push(record);
    }
  }
  for (const [clubId, squad] of squads) {
    const original =
      squadOverrides[clubId] ?? clubs.find((club) => club.id === clubId)?.squadPlayerIds ?? [];
    if (squad.length !== original.length || squad.some((id, index) => id !== original[index]))
      squadOverrides[clubId] = [...new Set(squad)];
  }
  delta = {
    ...delta,
    footballerStateOverrides,
    squadOverrides,
    npcTransferRecords: records,
    npcTransferMarketProcessedThroughSeason: season,
  };
  return { ...career, worldDelta: delta };
};
