import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type {
  CareerState,
  Id,
  PlayerPosition,
  ProfessionalClub,
} from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta, resolveYouthCohort } from './worldDatabase';

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
  const footballerOverrides = reuseOwnedDeltaMaps
    ? delta.footballerOverrides
    : { ...delta.footballerOverrides };
  const squadOverrides = reuseOwnedDeltaMaps ? delta.squadOverrides : { ...delta.squadOverrides };
  const resolveFootballer = (id: Id) =>
    footballerOverrides[id] ?? delta.newFootballers[id] ?? career.footballerWorld?.[id];
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
  for (const id in footballerOverrides) {
    if (inspectedOverrides++ >= 96) break;
    if (!membership.has(id) && !footballerOverrides[id]!.currentClubId) include(id);
  }
  for (const id in delta.newFootballers)
    if (!membership.has(id) && !delta.newFootballers[id]!.currentClubId) include(id);
  const candidates = candidateIds.map((id) => [id, resolveFootballer(id)!] as const);
  const unattachedCandidates = candidates.filter(([id]) => !membership.has(id));
  const moved = new Set<Id>();
  const outgoing = new Map<Id, number>();
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
    for (let incoming = 0; incoming < attempts; incoming++) {
      if (!rng.bool(0.66)) continue;
      const destinationSquad = squads.get(club.id) ?? [];
      if (destinationSquad.length >= 30) break;
      const ranked = shortlist
        .filter(
          ([id]) =>
            !moved.has(id) &&
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
      const sourceId = membership.get(selected.id);
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
      const role =
        selected.score > 65
          ? 'first_team_competition'
          : getProfileAge(selected.player.profile, boundaryDate, `${season}-07-01`) <= 21
            ? 'development_player'
            : 'rotation';
      footballerOverrides[selected.id] = {
        ...selected.player,
        currentClubId: club.id,
        currentContract: {
          clubId: club.id,
          startDate: boundaryDate,
          endDate: `${Number(boundaryDate.slice(0, 4)) + rng.int(1, 3)}-06-30`,
          monthlySalary: Math.max(
            1200,
            Math.round(
              (getPlayerOverall(selected.player.profile, selected.player.profile.primaryPosition) **
                2 *
                (5 - club.leagueTier)) /
                10,
            ) * 10,
          ),
          signingBonus: 0,
          squadRole: role,
          contractType: role === 'development_player' ? 'development' : 'professional',
        },
      };
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
    footballerOverrides,
    squadOverrides,
    npcTransferMarketProcessedThroughSeason: season,
  };
  return { ...career, worldDelta: delta };
};
