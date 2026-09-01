import type {
  CareerState,
  HistoryFact,
  MatchAppearance,
  PlayerAvailabilityState,
  PlayerInjury,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

const emptyState = (): PlayerAvailabilityState => ({
  injuries: [],
  suspensionMatchesRemaining: 0,
  leagueYellowCards: 0,
  matchesMissedThroughSuspension: 0,
  matchesMissedThroughInjury: 0,
});

export const availabilityState = (career: CareerState) => career.playerAvailability ?? emptyState();

export const getPlayerAvailability = (career: CareerState, date: string) => {
  void date;
  const state = availabilityState(career);
  const injury = state.injuries.find(
    (item) => item.status === 'active' && item.matchesRemaining > 0,
  );
  if (state.suspensionMatchesRemaining > 0)
    return {
      available: false,
      status: 'suspended' as const,
      suspensionMatchesRemaining: state.suspensionMatchesRemaining,
    };
  if (injury && injury.severity !== 'knock')
    return { available: false, status: 'injured' as const, injury };
  if (injury) return { available: true, status: 'knock' as const, injury };
  if (career.player.fitness < 25) return { available: false, status: 'unfit' as const };
  return { available: true, status: 'healthy' as const };
};

const positionRisk = (position: string) =>
  position.includes('back') || position.includes('defensive')
    ? 0.055
    : position.includes('mid')
      ? 0.04
      : position.includes('goal')
        ? 0.012
        : 0.025;

export const generateInjuryMetadata = (rng: RandomGenerator, source: PlayerInjury['source']) => {
  const pairs: ReadonlyArray<readonly [PlayerInjury['injuryType'], string]> =
    source === 'overload'
      ? ([
          ['muscle_overload', 'thigh'],
          ['strain', 'calf'],
          ['joint_injury', 'knee'],
        ] as const)
      : source === 'training'
        ? ([
            ['strain', 'thigh'],
            ['sprain', 'ankle'],
            ['muscle_overload', 'calf'],
          ] as const)
        : ([
            ['bruise', 'thigh'],
            ['strain', 'hamstring'],
            ['sprain', 'ankle'],
            ['joint_injury', 'knee'],
            ['concussion', 'head'],
          ] as const);
  const [injuryType, bodyArea] = rng.pick(pairs);
  return { injuryType, bodyArea };
};

export interface TerminalAppearanceCandidates {
  injuryMinute?: number | undefined;
  dismissalMinute?: number | undefined;
}

/** Resolves mutually exclusive events which end one on-pitch appearance. */
export const resolveTerminalAppearanceEvents = (
  plannedMinutes: number,
  candidates: TerminalAppearanceCandidates,
) => {
  const injuryMinute =
    candidates.injuryMinute && candidates.injuryMinute <= plannedMinutes
      ? candidates.injuryMinute
      : undefined;
  const dismissalMinute =
    candidates.dismissalMinute && candidates.dismissalMinute <= plannedMinutes
      ? candidates.dismissalMinute
      : undefined;
  if (
    injuryMinute !== undefined &&
    (dismissalMinute === undefined || injuryMinute < dismissalMinute)
  )
    return { minutes: injuryMinute, injuryMinute };
  if (dismissalMinute !== undefined) return { minutes: dismissalMinute, dismissalMinute };
  return { minutes: plannedMinutes };
};

/** Deterministic, contextual discipline and injury roll shared by quick and full matches. */
export const rollMatchAvailabilityEffects = (career: CareerState, appearance: MatchAppearance) => {
  if (!appearance.minutes) return { appearance };
  const rng = RandomGenerator.fromSeed(`${career.seed}:availability:${appearance.matchId}`);
  const fatigue = Math.max(0, 65 - career.player.fitness) / 100;
  const yellowChance =
    positionRisk(career.player.primaryPosition) +
    appearance.defensiveActions * 0.008 +
    appearance.minutes / 2600 +
    fatigue * 0.04;
  const yellowCards = rng.bool(yellowChance) ? 1 : 0;
  const secondYellow = yellowCards === 1 && rng.bool(0.025 + appearance.minutes / 9000);
  const direct = !secondYellow && rng.bool(0.003 + appearance.defensiveActions / 1800);
  const redCard = secondYellow
    ? ('second_yellow' as const)
    : direct
      ? ('direct' as const)
      : undefined;
  const injuryChance =
    0.012 +
    appearance.minutes / 3200 +
    fatigue * 0.12 +
    (getPlayerAvailability(career, appearance.date).status === 'knock' ? 0.08 : 0);
  let injury: PlayerInjury | undefined;
  let injuryMinute: number | undefined;
  if (rng.bool(injuryChance)) {
    const severity = rng.float() < 0.62 ? 'minor' : rng.float() < 0.88 ? 'moderate' : 'major';
    const ranges = { minor: [1, 2], moderate: [2, 5], major: [6, 12] } as const;
    const range = ranges[severity];
    const metadata = generateInjuryMetadata(rng, 'match');
    injury = {
      id: `injury_${appearance.matchId}`,
      startDate: appearance.date,
      severity,
      ...metadata,
      matchesRemaining: rng.int(range[0], range[1]),
      source: 'match',
      status: 'active',
    };
    injuryMinute = Math.max(10, appearance.minutes - rng.int(0, 18));
  }
  const dismissalMinute = redCard ? Math.max(20, appearance.minutes - rng.int(0, 12)) : undefined;
  const terminal = resolveTerminalAppearanceEvents(appearance.minutes, {
    injuryMinute,
    dismissalMinute,
  });
  if (terminal.injuryMinute === undefined) injury = undefined;
  return {
    appearance: {
      ...appearance,
      minutes: terminal.minutes,
      yellowCards,
      ...(terminal.dismissalMinute !== undefined
        ? { redCard, dismissedMinute: terminal.dismissalMinute }
        : {}),
      ...(injury ? { injuryId: injury.id } : {}),
    },
    injury,
  };
};

export const applyMatchAvailabilityEffects = (
  career: CareerState,
  raw: MatchAppearance,
  date: string,
): { career: CareerState; appearance: MatchAppearance; facts: HistoryFact[] } => {
  const rolled = rollMatchAvailabilityEffects(career, raw);
  const state = availabilityState(career);
  if (state.processedMatchIds?.includes(raw.matchId))
    return { career, appearance: rolled.appearance, facts: [] };
  let yellows =
    state.leagueYellowCards +
    (rolled.appearance.teamLevel === 'senior' ? (rolled.appearance.yellowCards ?? 0) : 0);
  let suspension = state.suspensionMatchesRemaining;
  if (rolled.appearance.redCard === 'direct')
    suspension += RandomGenerator.fromSeed(`${career.seed}:ban:${raw.matchId}`).int(1, 3);
  else if (rolled.appearance.redCard === 'second_yellow') suspension += 1;
  else if (yellows >= 4) {
    suspension += 1;
    yellows -= 4;
  }
  const facts: HistoryFact[] = [];
  if (rolled.injury && ['moderate', 'major'].includes(rolled.injury.severity))
    facts.push({
      id: `fact_${rolled.injury.id}`,
      factType: 'player_injured',
      season: career.currentSeason,
      date,
      actors: [career.player.id],
      targets: [],
      clubs: [career.currentClub.id],
      competitions: [],
      data: rolled.injury as unknown as Record<string, unknown>,
      causes: [],
      tags: ['availability', 'injury'],
      visibility: 'partial',
      narrativeImportance: rolled.injury.severity === 'major' ? 82 : 60,
      emotionalTone: 'negative',
    });
  return {
    appearance: rolled.appearance,
    facts,
    career: {
      ...career,
      playerAvailability: {
        ...state,
        leagueYellowCards: yellows,
        suspensionMatchesRemaining: suspension,
        injuries: rolled.injury ? [...state.injuries, rolled.injury] : state.injuries,
        processedMatchIds: [...(state.processedMatchIds ?? []), raw.matchId],
      },
    },
  };
};

/** Advances bans/injuries once per senior round, including rounds the player misses. */
export const consumeUnavailableRound = (career: CareerState, date: string): CareerState => {
  const state = availabilityState(career);
  const current = getPlayerAvailability(career, date);
  return {
    ...career,
    playerAvailability: {
      ...state,
      suspensionMatchesRemaining: Math.max(
        0,
        state.suspensionMatchesRemaining - (current.status === 'suspended' ? 1 : 0),
      ),
      matchesMissedThroughSuspension:
        state.matchesMissedThroughSuspension + (current.status === 'suspended' ? 1 : 0),
      matchesMissedThroughInjury:
        state.matchesMissedThroughInjury + (current.status === 'injured' ? 1 : 0),
      injuries: state.injuries.map((i) =>
        i.status !== 'active'
          ? i
          : {
              ...i,
              matchesRemaining: Math.max(0, i.matchesRemaining - 1),
              status: i.matchesRemaining <= 1 ? 'recovered' : 'active',
              ...(i.matchesRemaining <= 1 ? { recoveryDate: date } : {}),
            },
      ),
    },
  };
};
