import type {
  CareerState,
  ClubCompetitiveProfile,
  CoachSelectionProfile,
  HistoryFact,
  MatchAppearance,
  MatchDecision,
  MatchMomentDefinition,
  MatchMomentResult,
  MatchState,
  MatchTier,
  OpponentProfile,
  PlayerAttributes,
  PlayerPosition,
  PositionGroup,
  SquadAvailability,
  SquadStatus,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { assignedRole } from './events/postSelectionPath';
import { getWeeklyClubLoad } from './augustPlanning';
import { evaluateMatchRating, normalizeTeamStats } from './matchFeedback';
import { evaluatePlayStyleUnlocks, playStyleDecisionModifier } from './playStyles';

export const SEPTEMBER_DATES = ['2026-09-05', '2026-09-12', '2026-09-19', '2026-09-26'] as const;
export const VISTULA_NOVA_PROFILE: ClubCompetitiveProfile = {
  overallStrength: 56,
  positionalUnits: {
    goalkeeper: { starterQuality: 59, backupQuality: 48, depth: 'thin' },
    defense: { starterQuality: 57, backupQuality: 50, depth: 'normal' },
    midfield: { starterQuality: 60, backupQuality: 53, depth: 'deep' },
    attack: { starterQuality: 55, backupQuality: 49, depth: 'normal' },
  },
};
export const TOMASZ_RADECKI_PROFILE: CoachSelectionProfile = {
  youthTrust: 53,
  experiencePreference: 68,
  tacticalDiscipline: 82,
  formSensitivity: 61,
  potentialPatience: 42,
  riskTolerance: 38,
};
const positionWeights: Record<PlayerPosition, Partial<Record<keyof PlayerAttributes, number>>> = {
  goalkeeper: {
    composure: 0.26,
    technique: 0.19,
    vision: 0.18,
    leadership: 0.22,
    stamina: 0.05,
    pace: 0.05,
    defending: 0.05,
  },
  center_back: {
    defending: 0.3,
    composure: 0.22,
    leadership: 0.18,
    stamina: 0.16,
    technique: 0.14,
  },
  full_back: { defending: 0.24, pace: 0.22, stamina: 0.22, technique: 0.17, vision: 0.15 },
  defensive_midfielder: {
    defending: 0.23,
    vision: 0.22,
    composure: 0.2,
    stamina: 0.19,
    technique: 0.16,
  },
  central_midfielder: {
    vision: 0.24,
    technique: 0.23,
    stamina: 0.2,
    composure: 0.19,
    leadership: 0.14,
  },
  attacking_midfielder: {
    vision: 0.25,
    technique: 0.24,
    finishing: 0.18,
    composure: 0.18,
    pace: 0.15,
  },
  winger: { pace: 0.25, technique: 0.24, finishing: 0.19, vision: 0.17, composure: 0.15 },
  striker: { finishing: 0.29, composure: 0.23, pace: 0.19, technique: 0.16, stamina: 0.13 },
};
const normalizePosition = (position: string): PlayerPosition =>
  position in positionWeights
    ? (position as PlayerPosition)
    : position.includes('goal')
      ? 'goalkeeper'
      : position.includes('back')
        ? 'center_back'
        : position.includes('mid')
          ? 'central_midfielder'
          : position.includes('wing')
            ? 'winger'
            : 'striker';
export const evaluatePlayerForPosition = (player: CareerState['player'], position: string) =>
  Object.entries(positionWeights[normalizePosition(position)]).reduce(
    (sum, [key, weight]) => sum + player.attributes[key as keyof PlayerAttributes] * weight!,
    0,
  ) * (player.positionFamiliarity[position] ?? 0.85);
const unitFor = (position: string): keyof ClubCompetitiveProfile['positionalUnits'] =>
  normalizePosition(position) === 'goalkeeper'
    ? 'goalkeeper'
    : ['center_back', 'full_back'].includes(normalizePosition(position))
      ? 'defense'
      : ['striker', 'winger'].includes(normalizePosition(position))
        ? 'attack'
        : 'midfield';
const hasFact = (career: CareerState, type: string) =>
  career.historyFacts.some((f) => f.factType === type);
const makeFact = (
  career: CareerState,
  type: string,
  date: string,
  data: Record<string, unknown>,
  importance = 40,
): HistoryFact => ({
  id: `fact_${type}_${date}_${career.historyFacts.length}`,
  factType: type,
  season: career.currentSeason,
  date,
  actors: [career.player.id],
  targets: [],
  clubs: [career.currentClub.id],
  competitions: ['Liga regionalna'],
  data,
  causes: career.historyFacts.slice(-3).map((f) => f.id),
  tags: ['september_2026', type],
  visibility: 'partial',
  narrativeImportance: importance,
  emotionalTone: 'neutral',
});
export const generateSeptemberOpponents = (seed: string): OpponentProfile[] => {
  const rng = RandomGenerator.fromSeed(`${seed}:september:opponents`);
  const names = ['Orkan Brzeziny', 'Pogoń Żurawie', 'LKS Kamienny Brzeg', 'Sokół Nadwiśle'];
  const strengths = [48, 56, 62, rng.int(49, 64)];
  const styles = [
    ['niski blok', 'stałe fragmenty', 'przestrzeń za bocznymi obrońcami'],
    ['cierpliwe posiadanie', 'gra między liniami', 'powrót po stracie'],
    ['wysoki pressing', 'intensywność', 'miejsce za pressingiem'],
    ['bezpośrednia gra', 'drugie piłki', 'wolni stoperzy'],
  ];
  return rng.shuffle(
    names.map((name, i) => ({
      id: `september_opponent_${i}`,
      name,
      strength: strengths[i]!,
      style: styles[i]![0]!,
      strengths: [styles[i]![1]!],
      weaknesses: [styles[i]![2]!],
    })),
  );
};
export const generateSquadAvailability = (seed: string): SquadAvailability[] => {
  const rng = RandomGenerator.fromSeed(`${seed}:september:availability`);
  return (['goalkeeper', 'defense', 'midfield', 'attack'] as const).map((unit) => {
    const roll = rng.float();
    const severity = roll < 0.67 ? 'full' : roll < 0.94 ? 'one_absence' : 'several_absences';
    return {
      unit,
      severity,
      reason:
        severity === 'full'
          ? 'none'
          : rng.pick(['minor_injury', 'major_injury', 'suspension', 'fatigue'] as const),
    };
  });
};
export const initializeSeptemberPhase = (career: CareerState): CareerState => {
  if (!hasFact(career, 'august_2026_completed') || hasFact(career, 'september_2026_started'))
    return career;
  return {
    ...career,
    september: {
      fixtureIndex: 0,
      opponents: generateSeptemberOpponents(career.seed),
      availability: generateSquadAvailability(career.seed),
      completed: false,
    },
    historyFacts: [
      ...career.historyFacts,
      makeFact(career, 'september_2026_started', '2026-09-01', {}, 45),
    ],
  };
};
export interface FixtureContext {
  fixtureIndex: number;
  opponent: OpponentProfile;
  venue: 'home' | 'away';
  availability?: SquadAvailability[];
}
export const evaluateSquadOpportunity = (
  career: CareerState,
  fixture: FixtureContext,
  coach = TOMASZ_RADECKI_PROFILE,
): { status: SquadStatus; reason: string; selectionScore: number } => {
  const role = assignedRole(career);
  const unit = unitFor(career.player.primaryPosition);
  const competition = VISTULA_NOVA_PROFILE.positionalUnits[unit];
  const absence =
    (fixture.availability ?? career.september?.availability ?? []).find((a) => a.unit === unit)
      ?.severity ?? 'full';
  const previous = (career.matchHistory ?? []).slice(-3);
  const form = previous.length
    ? previous.reduce((s, a) => s + a.personalImpact, 0) / previous.length
    : 0;
  const relation = Object.values(career.relationships)[0]?.respect ?? 50;
  const development = career.augustPlanning?.results.reduce((s, r) => s + r.development, 0) ?? 0;
  const rng = RandomGenerator.fromSeed(`${career.seed}:selection:${fixture.fixtureIndex}`);
  const score =
    evaluatePlayerForPosition(career.player, career.player.primaryPosition) * 0.33 +
    (100 - competition.starterQuality) * 0.12 +
    career.player.morale * 0.08 +
    career.player.fitness * 0.1 +
    relation * 0.06 +
    career.player.potential * (coach.potentialPatience / 100) * 0.06 +
    coach.youthTrust * 0.08 +
    coach.tacticalDiscipline * 0.03 +
    development * 0.25 +
    (form * coach.formSensitivity) / 400 +
    (absence === 'one_absence' ? 7 : absence === 'several_absences' ? 13 : 0) +
    (rng.float() - 0.5) * 7;
  const seniorPath = [
    'senior_training_rotation',
    'senior_trial_extended',
    'weekly_senior_access',
  ].includes(role ?? '');
  let status: SquadStatus;
  if (seniorPath)
    status =
      score >= 60
        ? 'senior_starter'
        : score >= 50
          ? 'senior_bench'
          : score >= 42
            ? 'academy_starter'
            : 'senior_out';
  else
    status =
      score >= 68
        ? 'senior_bench'
        : score >= 48
          ? 'academy_starter'
          : score >= 40
            ? 'academy_bench'
            : 'no_match';
  const reason =
    absence !== 'full' && score >= 48
      ? 'Brak jednego z regularnie grających zawodników otworzył miejsce wcześniej, niż można było oczekiwać.'
      : status.includes('bench')
        ? 'Sztab nie rzuca cię jeszcze od pierwszej minuty, ale znalazł dla ciebie miejsce na ławce.'
        : status === 'academy_starter'
          ? 'Sztab uważa, że więcej zyskasz, grając pełny mecz w akademii.'
          : status === 'no_match' || status === 'senior_out'
            ? 'Tym razem konkurenci są wyżej w hierarchii, a weekend oglądasz z boku.'
            : 'Sportowo jesteś blisko podstawowych zawodników i dostajesz szansę od początku.';
  return { status, reason, selectionScore: score };
};
const decision = (
  id: string,
  label: string,
  description: string,
  gain: string,
  risk: string,
  attributes: MatchDecision['weights']['attributes'],
  riskValue: number,
  personalBias = 0,
  teamBias = 0,
  coachBias = 0,
): MatchDecision => ({
  id,
  label,
  description,
  visibleGain: gain,
  visibleRisk: risk,
  weights: { attributes, fitnessWeight: 0.12, moraleWeight: 0.08, pressureWeight: 0.1 },
  risk: riskValue,
  personalBias,
  teamBias,
  coachBias,
});
const commonDecisions = [
  decision(
    'bold',
    'Weź odpowiedzialność',
    'Podejmij odważną próbę.',
    'Możesz stworzyć bezpośrednie zagrożenie.',
    'Strata otworzy rywalowi kontrę.',
    { technique: 0.4, composure: 0.3, vision: 0.3 },
    13,
    2,
    0,
    -1,
  ),
  decision(
    'team',
    'Zagraj dla zespołu',
    'Wybierz rozwiązanie podtrzymujące akcję.',
    'Drużyna zachowa kontrolę i ustawienie.',
    'Możesz pozostać mniej widoczny.',
    { vision: 0.4, composure: 0.35, technique: 0.25 },
    5,
    -1,
    2,
    2,
  ),
];
const positionalMomentSeeds: Array<[string, PositionGroup, string]> = [
  ['gk_close', 'goalkeeper', 'Strzał z bliska'],
  ['gk_cross', 'goalkeeper', 'Dośrodkowanie w tłoku'],
  ['gk_counter', 'goalkeeper', 'Okazja do rozpoczęcia kontry'],
  ['def_duel', 'defender', 'Pojedynek jeden na jednego'],
  ['def_press', 'defender', 'Wyprowadzenie spod pressingu'],
  ['def_cover', 'defender', 'Asekuracja partnera'],
  ['mid_progress', 'midfielder', 'Progresywne podanie między liniami'],
  ['mid_press', 'midfielder', 'Pressing i szansa na odbiór'],
  ['mid_box', 'midfielder', 'Piłka przed polem karnym'],
  ['att_run', 'attacker', 'Wyjście na wolne pole'],
  ['att_duel', 'attacker', 'Pojedynek z obrońcą'],
  ['att_final', 'attacker', 'Strzał, podanie albo utrzymanie piłki'],
];
export const MATCH_MOMENT_LIBRARY: MatchMomentDefinition[] = positionalMomentSeeds
  .map(([id, group, title]) => ({
    id,
    positionGroups: [group],
    situationTags: [id],
    introductions: [
      `${title}. Rywal jest blisko i musisz zdecydować bez pełnej wiedzy.`,
      `${title}. Tempo rośnie, a ustawienie przeciwnika daje tylko chwilę.`,
    ],
    decisions: commonDecisions,
  }))
  .concat([
    {
      id: 'late_trailing_tired',
      positionGroups: ['goalkeeper', 'defender', 'midfielder', 'attacker'],
      situationTags: ['late', 'trailing', 'tired'],
      introductions: [
        'Przegrywacie. Do końca zostało niewiele czasu, a nogi są ciężkie.',
        'Zegar pracuje dla rywala. Czujesz zmęczenie i widzisz niepokój kolegów.',
      ],
      decisions: [
        decision(
          'rally',
          'Poderwij drużynę i zostań',
          'Pomóż utrzymać wiarę do końca.',
          'Energia może udzielić się zespołowi.',
          'Zmęczenie ograniczy precyzję.',
          { leadership: 0.5, stamina: 0.3, composure: 0.2 },
          8,
          1,
          2,
          1,
        ),
        decision(
          'carry',
          'Weź ciężar gry na siebie',
          'Poszukaj akcji, która odmieni mecz.',
          'Możesz zostać bohaterem końcówki.',
          'Strata zabierze cenny czas.',
          { technique: 0.35, composure: 0.35, stamina: 0.3 },
          16,
          3,
          -1,
          0,
        ),
        decision(
          'substitute',
          'Poproś o zmianę',
          'Zasygnalizuj, że świeży zawodnik może dać więcej.',
          'Świeże nogi poprawią szanse drużyny.',
          'Nie pokażesz się w decydujących minutach.',
          { leadership: 0.45, composure: 0.4, vision: 0.15 },
          3,
          -2,
          3,
          3,
        ),
      ],
    },
    {
      id: 'late_leading',
      positionGroups: ['goalkeeper', 'defender', 'midfielder', 'attacker'],
      situationTags: ['late', 'leading'],
      introductions: [
        'Prowadzicie, ale rywal przesuwa coraz więcej ludzi do ataku.',
        'Końcówka wymaga wyboru między kolejnym ciosem a kontrolą.',
      ],
      decisions: commonDecisions,
    },
  ]);
const positionGroup = (p: string): PositionGroup =>
  normalizePosition(p) === 'goalkeeper'
    ? 'goalkeeper'
    : ['center_back', 'full_back'].includes(normalizePosition(p))
      ? 'defender'
      : ['striker', 'winger'].includes(normalizePosition(p))
        ? 'attacker'
        : 'midfielder';
const background = (
  seed: string,
  team: number,
  opp: number,
  venue: 'home' | 'away',
  impact = 0,
) => {
  const rng = RandomGenerator.fromSeed(seed);
  const delta = team - opp + (venue === 'home' ? 5 : -2) + impact * 0.8;
  const forGoals = Math.max(0, Math.min(4, Math.floor(rng.float() * 2.6 + 0.7 + delta / 28)));
  const against = Math.max(0, Math.min(4, Math.floor(rng.float() * 2.6 + 0.7 - delta / 28)));
  return { forGoals, against };
};
const backgroundFeedback = (seed: string, team: number, opp: number, venue: 'home' | 'away') => {
  const rng = RandomGenerator.fromSeed(`${seed}:feedback`);
  const advantage = team - opp + (venue === 'home' ? 5 : -2);
  const homePossession = Math.max(
    35,
    Math.min(
      65,
      Math.round(50 + (venue === 'home' ? advantage : -advantage) * 0.3 + rng.int(-5, 5)),
    ),
  );
  const homeShots = Math.max(
    3,
    Math.round(10 + (venue === 'home' ? advantage : -advantage) / 5 + rng.int(-3, 3)),
  );
  const awayShots = Math.max(
    3,
    Math.round(10 - (venue === 'home' ? advantage : -advantage) / 5 + rng.int(-3, 3)),
  );
  const teamStats = normalizeTeamStats({
    home: {
      possession: homePossession,
      shots: homeShots,
      shotsOnTarget: Math.round(homeShots * 0.28 + rng.float() * 0.27),
      xG: homeShots * 0.06 + rng.float() * 0.08,
      dangerousActions: homeShots + rng.int(2, 8),
    },
    away: {
      possession: 100 - homePossession,
      shots: awayShots,
      shotsOnTarget: Math.round(awayShots * 0.28 + rng.float() * 0.27),
      xG: awayShots * 0.06 + rng.float() * 0.08,
      dangerousActions: awayShots + rng.int(2, 8),
    },
  });
  const final = background(seed, team, opp, venue);
  const homeGoals = venue === 'home' ? final.forGoals : final.against,
    awayGoals = venue === 'home' ? final.against : final.forGoals;
  const goalMinutes = rng
    .shuffle(Array.from({ length: 16 }, (_, i) => 8 + i * 5))
    .slice(0, homeGoals + awayGoals)
    .sort((a, b) => a - b);
  const events = [...Array(homeGoals).fill('home'), ...Array(awayGoals).fill('away')];
  const momentum = Array.from({ length: 19 }, (_, index) => {
    const minute = index * 5;
    const eventIndex = goalMinutes.findIndex((m) => Math.abs(m - minute) <= 2);
    return {
      minute,
      homeThreat: Math.max(
        0,
        Math.min(100, Math.round(48 + (homePossession - 50) + rng.int(-22, 22))),
      ),
      awayThreat: Math.max(
        0,
        Math.min(100, Math.round(48 - (homePossession - 50) + rng.int(-22, 22))),
      ),
      ...(eventIndex >= 0 ? { event: 'goal' as const, scoringSide: events[eventIndex] } : {}),
    };
  });
  return { teamStats, momentum, homeGoals, awayGoals };
};
const scoreAtMinute = (match: MatchState, minute: number) => ({
  homeGoals: (match.momentum ?? []).filter(
    (point) => point.minute <= minute && point.event === 'goal' && point.scoringSide === 'home',
  ).length,
  awayGoals: (match.momentum ?? []).filter(
    (point) => point.minute <= minute && point.event === 'goal' && point.scoringSide === 'away',
  ).length,
});
export const startSeptemberMatch = (career: CareerState): CareerState => {
  if (career.activeMatch || !career.september || career.september.completed) return career;
  const i = career.september.fixtureIndex;
  const opponent = career.september.opponents[i];
  if (!opponent) return career;
  const venue = i % 2 === 0 ? 'home' : 'away';
  const selection = evaluateSquadOpportunity(career, {
    fixtureIndex: i,
    opponent,
    venue,
    availability: career.september.availability,
  });
  const rng = RandomGenerator.fromSeed(`${career.seed}:match:${i}`);
  const started = selection.status.endsWith('starter');
  const bench = selection.status.endsWith('bench');
  const enters = bench && rng.bool(0.7);
  const plannedMinutes = started ? rng.int(72, 90) : enters ? rng.int(8, 35) : 0;
  const teamLevel = selection.status.startsWith('senior') ? 'senior' : 'academy';
  const count =
    plannedMinutes === 0
      ? 0
      : plannedMinutes <= 25
        ? 1
        : plannedMinutes <= 60
          ? rng.int(1, 2)
          : rng.int(2, 3);
  const pool = MATCH_MOMENT_LIBRARY.filter((m) =>
    m.positionGroups.includes(positionGroup(career.player.primaryPosition)),
  );
  const moments = rng
    .shuffle(pool)
    .slice(0, count)
    .map((m, j) => ({
      definitionId: m.id,
      minute: started
        ? Math.min(88, 18 + j * Math.floor(60 / Math.max(1, count)) + rng.int(0, 8))
        : 90 - plannedMinutes + j * Math.floor(plannedMinutes / Math.max(1, count)),
      scoreFor: 0,
      scoreAgainst: 0,
      description: rng.pick(m.introductions),
    }));
  const feedback = backgroundFeedback(
    `${career.seed}:match:${i}:opening`,
    VISTULA_NOVA_PROFILE.overallStrength,
    opponent.strength,
    venue,
  );
  const activeMatch: MatchState = {
    id: `match_2026_09_${i + 1}`,
    fixtureIndex: i,
    date: SEPTEMBER_DATES[i]!,
    competition: 'Liga regionalna',
    teamLevel,
    opponent,
    venue,
    squadStatus: selection.status,
    currentMinute: 0,
    homeGoals: 0,
    awayGoals: 0,
    playerMinutes: 0,
    plannedMinutes,
    moments,
    resolvedMoments: [],
    teamStats: feedback.teamStats,
    momentum: feedback.momentum,
    completed: false,
  };
  return { ...career, activeMatch };
};
export const resolveMatchDecision = (career: CareerState, decisionId: string): CareerState => {
  const match = career.activeMatch;
  if (!match || match.completed) return career;
  const moment = match.currentMoment ?? match.moments[match.resolvedMoments.length];
  if (!moment) return finishMatch(career);
  const def = MATCH_MOMENT_LIBRARY.find((m) => m.id === moment.definitionId)!;
  const choice = def.decisions.find((d) => d.id === decisionId)!;
  const fatigue = Math.max(0, moment.minute - 55) * 0.18;
  const weighted = Object.entries(choice.weights.attributes).reduce(
    (s, [k, w]) => s + career.player.attributes[k as keyof PlayerAttributes] * w!,
    0,
  );
  const previous = match.resolvedMoments.reduce((s, r) => s + r.personalImpact, 0);
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:${match.id}:${moment.definitionId}:${decisionId}`,
  );
  const value =
    weighted +
    career.player.fitness * (choice.weights.fitnessWeight ?? 0) +
    career.player.morale * (choice.weights.moraleWeight ?? 0) -
    match.opponent.strength * 0.25 -
    fatigue +
    previous * 0.2 +
    playStyleDecisionModifier(career, moment.definitionId, decisionId) +
    rng.int(-18, 18) -
    choice.risk;
  const tier: MatchTier =
    value >= 60
      ? 'excellent'
      : value >= 48
        ? 'good'
        : value >= 34
          ? 'mixed'
          : value >= 20
            ? 'poor'
            : 'costly';
  const level = { excellent: 3, good: 2, mixed: 0, poor: -1, costly: -3 }[tier];
  const attacker = positionGroup(career.player.primaryPosition) === 'attacker';
  const goalkeeper = positionGroup(career.player.primaryPosition) === 'goalkeeper';
  const result: MatchMomentResult = {
    moment,
    decisionId,
    tier,
    personalImpact: level + choice.personalBias,
    teamImpact: level + choice.teamBias,
    coachImpact: Math.round(level * 0.6 + choice.coachBias),
    narrative:
      tier === 'excellent'
        ? 'Wykonujesz zamiar znakomicie, choć dalszy ciąg akcji zależy również od kolegów.'
        : tier === 'good'
          ? 'Dobre wykonanie pomaga drużynie i zostaje zauważone.'
          : tier === 'mixed'
            ? 'Pomysł działa tylko częściowo, lecz akcja nie kończy meczu.'
            : tier === 'poor'
              ? 'Nie wszystko wychodzi, ale wracasz do zadania.'
              : 'Błąd daje rywalowi groźną możliwość.',
    goals: attacker && tier === 'excellent' && choice.id === 'bold' && rng.bool(0.45) ? 1 : 0,
    assists: !goalkeeper && tier === 'excellent' && choice.id === 'team' && rng.bool(0.35) ? 1 : 0,
    xG: attacker && choice.id === 'bold' ? 0.18 : goalkeeper ? 0 : 0.03,
    xA: choice.id === 'team' && !goalkeeper ? 0.14 : 0.02,
    keyPasses: choice.id === 'team' && level > 0 ? 1 : 0,
    defensiveActions:
      ['defender', 'midfielder'].includes(positionGroup(career.player.primaryPosition)) && level > 0
        ? 1
        : 0,
    saves: goalkeeper && level > 0 ? 1 : 0,
    behaviorTags:
      moment.definitionId === 'mid_progress' && level > 0
        ? ['progressive_pass']
        : moment.definitionId === 'mid_press' && level > 0
          ? ['pressing_action']
          : moment.definitionId.startsWith('def_') && level > 0
            ? ['defensive_read']
            : moment.definitionId === 'gk_counter' && level > 0
              ? ['goalkeeper_distribution']
              : [],
  };
  const ratingBefore = evaluateMatchRating({
    position: career.player.primaryPosition,
    minutes: Math.max(1, match.playerMinutes),
    results: match.resolvedMoments,
  });
  const ratingAfter = evaluateMatchRating({
    position: career.player.primaryPosition,
    minutes: Math.max(1, moment.minute),
    results: [...match.resolvedMoments, result],
  });
  if (ratingBefore !== undefined) result.ratingBefore = ratingBefore;
  if (ratingAfter !== undefined) result.ratingAfter = ratingAfter;
  result.ratingExplanation =
    level > 0
      ? result.keyPasses
        ? 'Podaniem wyciąłeś linię rywala i stworzyłeś partnerowi dobrą sytuację.'
        : 'Dobre wykonanie pomogło drużynie utrzymać inicjatywę.'
      : 'Próba nie przyniosła efektu i ułatwiła rywalom przejęcie inicjatywy.';
  const updated = {
    ...match,
    ...scoreAtMinute(match, moment.minute),
    currentMinute: moment.minute,
    playerMinutes: Math.min(match.plannedMinutes, moment.minute),
    resolvedMoments: [...match.resolvedMoments, result],
    ...(ratingAfter !== undefined ? { liveRating: ratingAfter } : {}),
    currentMoment: undefined,
  };
  const next = updated.moments[updated.resolvedMoments.length];
  return next
    ? { ...career, activeMatch: { ...updated, currentMoment: next } }
    : finishMatch({ ...career, activeMatch: updated });
};
export const advanceMatch = (career: CareerState): CareerState => {
  const m = career.activeMatch;
  if (!m || m.completed) return career;
  const next = m.moments[m.resolvedMoments.length];
  return next
    ? {
        ...career,
        activeMatch: {
          ...m,
          ...scoreAtMinute(m, next.minute),
          currentMoment: next,
          currentMinute: next.minute,
        },
      }
    : finishMatch(career);
};
export const finishMatch = (career: CareerState): CareerState => {
  const m = career.activeMatch;
  if (!m || m.completed) return career;
  const personal = m.resolvedMoments.reduce((s, r) => s + r.personalImpact, 0);
  const final = backgroundFeedback(
    `${career.seed}:${m.id}:final`,
    VISTULA_NOVA_PROFILE.overallStrength,
    m.opponent.strength,
    m.venue,
  );
  const home =
      final.homeGoals +
      (m.venue === 'home' ? m.resolvedMoments.reduce((s, r) => s + r.goals, 0) : 0),
    away =
      final.awayGoals +
      (m.venue === 'away' ? m.resolvedMoments.reduce((s, r) => s + r.goals, 0) : 0);
  const rating = evaluateMatchRating({
    position: career.player.primaryPosition,
    minutes: m.plannedMinutes,
    results: m.resolvedMoments,
    goalsFor: m.venue === 'home' ? home : away,
    goalsAgainst: m.venue === 'home' ? away : home,
  });
  const appearance: MatchAppearance = {
    matchId: m.id,
    date: m.date,
    opponentId: m.opponent.id,
    teamLevel: m.teamLevel,
    started: m.squadStatus.endsWith('starter'),
    minutes: m.plannedMinutes,
    goals: m.resolvedMoments.reduce((s, r) => s + r.goals, 0),
    assists: m.resolvedMoments.reduce((s, r) => s + r.assists, 0),
    xG: m.resolvedMoments.reduce((s, r) => s + r.xG, 0),
    xA: m.resolvedMoments.reduce((s, r) => s + r.xA, 0),
    keyPasses: m.resolvedMoments.reduce((s, r) => s + r.keyPasses, 0),
    defensiveActions: m.resolvedMoments.reduce((s, r) => s + r.defensiveActions, 0),
    saves: m.resolvedMoments.reduce((s, r) => s + r.saves, 0),
    personalImpact: personal,
    ...(rating !== undefined ? { rating } : {}),
  };
  const facts = [
    makeFact(
      career,
      'match_played',
      m.date,
      {
        ...appearance,
        homeGoals: home,
        awayGoals: away,
        behaviorTags: m.resolvedMoments.flatMap((r) => r.behaviorTags ?? []),
      },
      35,
    ),
    makeFact(
      career,
      'match_appearance_assessed',
      m.date,
      {
        personalImpact: personal,
        coachImpact: m.resolvedMoments.reduce((s, r) => s + r.coachImpact, 0),
      },
      30,
    ),
  ];
  if (
    m.teamLevel === 'senior' &&
    m.plannedMinutes > 0 &&
    !(career.matchHistory ?? []).some((a) => a.teamLevel === 'senior' && a.minutes > 0)
  )
    facts.push(
      makeFact(
        career,
        'senior_debut',
        m.date,
        {
          started: appearance.started,
          minutes: appearance.minutes,
          homeGoals: home,
          awayGoals: away,
          personalImpact: personal,
        },
        90,
      ),
    );
  const load = getWeeklyClubLoad(career, m.plannedMinutes);
  const completedCareer: CareerState = {
    ...career,
    player: {
      ...career.player,
      fitness: Math.max(
        20,
        career.player.fitness - Math.round(m.plannedMinutes / 18) + (load < 65 ? 2 : 0),
      ),
    },
    matchHistory: [...(career.matchHistory ?? []), appearance],
    historyFacts: [...career.historyFacts, ...facts],
    activeMatch: {
      ...m,
      homeGoals: home,
      awayGoals: away,
      playerMinutes: m.plannedMinutes,
      currentMinute: 90,
      completed: true,
      ...(rating !== undefined ? { liveRating: rating } : {}),
      teamStats: final.teamStats,
      momentum: final.momentum,
    },
  };
  return evaluatePlayStyleUnlocks(completedCareer, m.date);
};
export const advanceSeptemberWeek = (career: CareerState): CareerState => {
  if (!career.activeMatch?.completed || !career.september) return career;
  const next = career.september.fixtureIndex + 1;
  if (next >= 4)
    return {
      ...career,
      activeMatch: undefined,
      september: { ...career.september, fixtureIndex: 4, completed: true },
      historyFacts: hasFact(career, 'september_2026_completed')
        ? career.historyFacts
        : [
            ...career.historyFacts,
            makeFact(
              career,
              'september_2026_completed',
              '2026-09-30',
              { appearances: (career.matchHistory ?? []).length },
              60,
            ),
          ],
    };
  return {
    ...career,
    activeMatch: undefined,
    september: {
      ...career.september,
      fixtureIndex: next,
      availability: generateSquadAvailability(`${career.seed}:${next}`),
    },
  };
};
export const opportunityDescription = (career: CareerState) => {
  const unit = VISTULA_NOVA_PROFILE.positionalUnits[unitFor(career.player.primaryPosition)];
  const quality = evaluatePlayerForPosition(career.player, career.player.primaryPosition);
  return unit.depth === 'deep'
    ? 'Konkurencja na tej pozycji jest duża.'
    : quality >= unit.starterQuality - 4
      ? 'Sportowo jesteś blisko poziomu podstawowych zawodników.'
      : 'Pierwszy skład stoi obecnie wyraźnie wyżej od ciebie.';
};
