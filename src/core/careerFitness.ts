import type {
  CareerState,
  FootballerCondition,
  MatchAppearance,
  WorldDatabase,
  WorldFootballer,
} from '../types/domain';
import {
  conditionRecoveryDate,
  isConditionAvailable,
  recoverFootballerCondition,
} from './fitnessRecovery';
import {
  emptyWorldDelta,
  resolveCareerWorldFootballer,
  resolveEffectiveProfessionalClub,
  resolveEffectiveSeniorSquad,
} from './worldDatabase';
import { createSingleMatchSession, type SingleMatchSetup } from './singleMatch';
import type { TacticalMatchState } from './matchSimulation/matchState';
import { getYouthSquadSelectionContext } from './youthWorld';
import { getPolishU17TeamDefinitions, getYouthTeamDisplayName } from '../content/world/polishU17';
import { professionalClubSchema } from '../schemas/domainSchemas';
import { suspendedCareerFootballers } from './careerMatchDiscipline';

/** Commits recovery at the existing simulation date before selection or a scheduled fixture. */
export const recoverCareerFitnessToDate = (career: CareerState, date: string): CareerState => {
  const delta = career.worldDelta ?? emptyWorldDelta();
  const stored = delta.footballerConditionOverrides?.[career.player.id];
  const previous: FootballerCondition = stored
    ? { ...stored, capacity: career.player.fitness }
    : { capacity: career.player.fitness, lastUpdatedDate: career.currentDate ?? date };
  const condition = recoverFootballerCondition(previous, date, career.player.attributes.stamina);
  if (stored && condition === previous && condition.capacity === career.player.fitness)
    return career;
  return {
    ...career,
    player: { ...career.player, fitness: condition.capacity },
    worldDelta: {
      ...delta,
      footballerConditionOverrides: {
        ...delta.footballerConditionOverrides,
        [career.player.id]: condition,
      },
    },
  };
};

/** The older narrative/quick career path has no tracking samples. Preserve that boundary:
 * this labelled summary cost uses participation, effort and recorded demanding actions.
 * It never claims that estimated metres are measured physical engine work. */
export const recordSummaryAppearanceCondition = (
  career: CareerState,
  appearance: MatchAppearance,
): CareerState => {
  const recovered = recoverCareerFitnessToDate(career, appearance.date);
  if (appearance.minutes <= 0) return recovered;
  const delta = recovered.worldDelta ?? emptyWorldDelta();
  const previous = delta.footballerConditionOverrides?.[recovered.player.id];
  if (
    previous?.lastMatchId === appearance.matchId ||
    (previous?.lastAppearanceDate && previous.lastAppearanceDate > appearance.date)
  )
    return recovered;
  const conditioning = 0.55 + recovered.player.attributes.stamina / 125;
  const effort = 0.7 + (recovered.player.matchEffort ?? 3) * 0.15;
  const activity =
    appearance.defensiveActions * 0.12 + appearance.keyPasses * 0.06 + appearance.goals * 0.15;
  const capacity = Math.max(
    0,
    recovered.player.fitness - ((appearance.minutes / 14 + activity) * effort) / conditioning,
  );
  const condition: FootballerCondition = {
    ...previous,
    capacity,
    lastUpdatedDate: appearance.date,
    lastAppearanceDate: appearance.date,
    lastAppearanceMinutes: appearance.minutes,
    lastMatchId: appearance.matchId,
    source: 'summary',
  };
  return {
    ...recovered,
    player: { ...recovered.player, fitness: capacity },
    worldDelta: {
      ...delta,
      footballerConditionOverrides: {
        ...delta.footballerConditionOverrides,
        [recovered.player.id]: condition,
      },
    },
  };
};

/** Adapter for a career-backed canonical fixture. Club membership, profiles and condition
 * are composed from the existing world overlays; bench identities are never cloned. */
export const createCareerSingleMatchSession = (
  career: CareerState,
  baseWorld: WorldDatabase,
  setup: SingleMatchSetup,
  date: string,
) => {
  const recovered = recoverCareerFitnessToDate(career, date);
  const atDate = { ...recovered, currentDate: date };
  const footballers: Record<string, WorldFootballer> = { ...baseWorld.footballers };
  const knownClubs = [...baseWorld.clubs];
  const suspended = suspendedCareerFootballers(career, date);
  if (career.leagueSeason?.competition.category === 'youth') {
    const definitions = getPolishU17TeamDefinitions(career.clubWorld ?? baseWorld.clubs);
    for (const teamId of [setup.homeClubId, setup.awayClubId]) {
      const definition = definitions.find((team) => team.id === teamId);
      const selection = getYouthSquadSelectionContext(atDate, teamId, career.currentSeason);
      if (!definition || !selection) throw new Error(`Brak rzeczywistej kadry U-17: ${teamId}.`);
      const parent = definition.parentClubId
        ? resolveEffectiveProfessionalClub(atDate, definition.parentClubId)
        : undefined;
      // Transport metadata only: competition and identities remain the actual youth season.
      const club = professionalClubSchema.parse({
        ...parent,
        id: teamId,
        name: getYouthTeamDisplayName(definition, parent),
        managerId: selection.managerId,
        country: parent?.country ?? 'PL',
        region: parent?.region ?? 'Polska',
        leagueTier: parent?.leagueTier ?? 4,
        reputation: parent?.reputation ?? 20,
        financialLevel: parent?.financialLevel ?? 20,
        playingStyle: parent?.playingStyle ?? 'rozwój',
        youthPolicy: 100,
        developmentReputation: parent?.developmentReputation ?? 50,
        sellingClubTendency: parent?.sellingClubTendency ?? 50,
        pressureLevel: 20,
        coachYouthTrust: 100,
        archetype: parent?.archetype ?? 'LOCAL_DEVELOPMENT',
        positionalNeeds:
          parent?.positionalNeeds ??
          Object.fromEntries(
            ['goalkeeper', 'defense', 'midfield', 'attack'].map((unit) => [
              unit,
              { starterQuality: 45, depth: 'normal', needLevel: 50 },
            ]),
          ),
        squadPlayerIds: selection.squadPlayerIds?.filter((id) => !suspended.has(id)),
      });
      for (const playerId of selection.squadPlayerIds ?? []) {
        const player =
          playerId === career.player.id && career.developmentProfile
            ? {
                profile: recovered.player,
                developmentProfile: career.developmentProfile,
                careerStatus: 'active' as const,
              }
            : resolveCareerWorldFootballer(atDate, playerId);
        if (!player) throw new Error(`Brak piłkarza kohorty: ${playerId}.`);
        footballers[playerId] = {
          ...player,
          currentClubId: teamId,
          ...(playerId === career.player.id
            ? { profile: career.player, fitness: recovered.player.fitness }
            : {}),
        };
      }
      knownClubs.push(club);
    }
    return createSingleMatchSession(
      { ...baseWorld, clubs: knownClubs, footballers },
      setup,
      date,
      recovered,
    );
  }
  for (const id of [setup.homeClubId, setup.awayClubId]) {
    const club =
      resolveEffectiveProfessionalClub(atDate, id) ??
      (atDate.currentProfessionalClub?.id === id ? atDate.currentProfessionalClub : undefined);
    if (club && !knownClubs.some((item) => item.id === id)) knownClubs.push(club);
  }
  const clubs = knownClubs.map((baseClub) => {
    if (baseClub.id !== setup.homeClubId && baseClub.id !== setup.awayClubId) return baseClub;
    const club = resolveEffectiveProfessionalClub(atDate, baseClub.id) ?? baseClub;
    const ids = resolveEffectiveSeniorSquad(atDate, club.id);
    const squad = (ids.length ? ids : (club.squadPlayerIds ?? [])).filter(
      (id) => !suspended.has(id),
    );
    for (const id of squad) {
      const player = resolveCareerWorldFootballer(atDate, id) ?? footballers[id];
      if (player) footballers[id] = player;
    }
    if (atDate.currentProfessionalClub?.id === club.id && atDate.developmentProfile) {
      footballers[atDate.player.id] = {
        profile: atDate.player,
        developmentProfile: atDate.developmentProfile,
        careerStatus: 'active',
        currentClubId: club.id,
        fitness: atDate.player.fitness,
        condition: atDate.worldDelta?.footballerConditionOverrides?.[atDate.player.id],
      };
    }
    return { ...club, squadPlayerIds: squad };
  });
  return createSingleMatchSession({ ...baseWorld, clubs, footballers }, setup, date, recovered);
};

/** A finished canonical fixture commits the actual participating bodies, including outgoing
 * players. Unused bench players retain their condition, and a repeat commit is idempotent. */
export const commitCanonicalMatchCondition = (
  career: CareerState,
  state: TacticalMatchState,
  date: string,
  matchId: string,
): CareerState => {
  if (state.status !== 'full_time' && state.status !== 'abandoned') return career;
  const delta = career.worldDelta ?? emptyWorldDelta();
  const conditions = { ...delta.footballerConditionOverrides };
  const participants = [
    ...(state.departedPlayers ?? []),
    ...(state.substitutionState?.pending.map((request) => request.outgoing) ?? []),
    ...state.players,
  ];
  const seen = new Set<string>();
  let fitness = career.player.fitness;
  for (const player of participants) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    const minutes =
      state.statistics?.players.find((entry) => entry.playerId === player.id)?.minutesPlayed ?? 0;
    if (minutes <= 0 || !player.fitness) continue;
    const previous = conditions[player.id];
    if (
      previous?.lastMatchId === matchId ||
      (previous?.lastAppearanceDate && previous.lastAppearanceDate > date)
    )
      continue;
    const injury = player.injury;
    const condition: FootballerCondition = {
      capacity: player.fitness.longTermCapacity * 100,
      lastUpdatedDate: date,
      lastAppearanceDate: date,
      lastAppearanceMinutes: minutes,
      lastMatchId: matchId,
      source: 'canonical',
      ...(injury && injury.recoveryDays > 0
        ? {
            injuryUntilDate: conditionRecoveryDate(date, injury.recoveryDays),
            injuryStatus: injury.status,
          }
        : {}),
    };
    conditions[player.id] = condition;
    if (player.id === career.player.id) fitness = condition.capacity;
  }
  return {
    ...career,
    player: { ...career.player, fitness },
    worldDelta: { ...delta, footballerConditionOverrides: conditions },
  };
};

export const isCareerFootballerPhysicallyAvailable = (
  career: CareerState,
  id: string,
  date: string,
): boolean => {
  const condition = career.worldDelta?.footballerConditionOverrides?.[id];
  return (
    !condition ||
    isConditionAvailable(
      recoverFootballerCondition(
        condition,
        date,
        id === career.player.id
          ? career.player.attributes.stamina
          : (resolveCareerWorldFootballer(career, id)?.profile.attributes.stamina ?? 50),
      ),
    )
  );
};
