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
  Fixture,
  OpponentProfile,
  PlayerAttributes,
  PlayerPosition,
  PositionGroup,
  SquadAvailability,
  SquadStatus,
} from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';
import { evaluateMatchRating, normalizeTeamStats } from './matchFeedback';
import { evaluatePlayStyleUnlocks, playStyleDecisionModifier } from './playStyles';
import { applyMatchAvailabilityEffects, getPlayerAvailability } from './playerAvailability';
import { settleLeagueRound } from './leagueSeason';
import { applyAppearanceConsequences } from './appearanceConsequences';
import {
  getExpectedAvailableMinuteShare,
  participationFromAppearance,
  recordParticipation,
  updateSelectionStanding,
} from './seasonParticipation';

export const VISTULA_NOVA_PROFILE: ClubCompetitiveProfile = {
  overallStrength: 52,
  positionalUnits: {
    goalkeeper: { starterQuality: 53, backupQuality: 45, depth: 'thin' },
    defense: { starterQuality: 52, backupQuality: 45, depth: 'normal' },
    midfield: { starterQuality: 54, backupQuality: 47, depth: 'normal' },
    attack: { starterQuality: 51, backupQuality: 44, depth: 'normal' },
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
  tags: ['match', type],
  visibility: 'partial',
  narrativeImportance: importance,
  emotionalTone: 'neutral',
});
export interface FixtureContext {
  fixtureIndex: number;
  fixtureId?: string;
  opponent: OpponentProfile;
  venue: 'home' | 'away';
  availability?: SquadAvailability[];
}
export const evaluateSquadOpportunity = (
  career: CareerState,
  fixture: FixtureContext,
  coach = getCurrentCoachSelectionProfile(career),
): { status: SquadStatus; reason: string; selectionScore: number } => {
  const unit = unitFor(career.player.primaryPosition);
  const competition = getCurrentClubCompetitiveProfile(career).positionalUnits[unit];
  const absence = (fixture.availability ?? []).find((a) => a.unit === unit)?.severity ?? 'full';
  const previous = (career.matchHistory ?? []).slice(-3);
  const form = previous.length
    ? previous.reduce((s, a) => s + a.personalImpact, 0) / previous.length
    : 0;
  const relation = Object.values(career.relationships)[0]?.respect ?? 50;
  const development = 0;
  const seniorPath = career.leagueSeason?.competition.category === 'professional';
  const availableRecords = (career.seasonParticipation ?? []).filter(
    (record) => !['injured', 'suspended', 'unfit'].includes(record.status),
  );
  const actualShare = availableRecords.length
    ? availableRecords.reduce((sum, record) => sum + record.minutes, 0) /
      (availableRecords.length * 90)
    : 0;
  const catchUp = seniorPath
    ? Math.max(
        0,
        getExpectedAvailableMinuteShare(career.currentContract?.squadRole ?? 'rotation').target -
          actualShare,
      ) * 24
    : 0;
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:${career.currentSeason}:selection:${fixture.fixtureId ?? fixture.fixtureIndex}`,
  );
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
    (seniorPath ? (career.selectionStanding ?? 50) * 0.08 : 0) +
    catchUp +
    {
      development_player: -7,
      rotation: 0,
      first_team_competition: 7,
      important_player: 14,
      star_player: 18,
    }[career.currentContract?.squadRole ?? 'rotation'] +
    (form * coach.formSensitivity) / 400 +
    (absence === 'one_absence' ? 7 : absence === 'several_absences' ? 13 : 0) +
    (rng.float() - 0.5) * 7;
  // Historical roles from older saves must not turn a U-17 fixture into a senior match.
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
  else status = score >= 45 ? 'academy_starter' : score >= 39 ? 'academy_bench' : 'no_match';
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

export interface ParticipationProjection {
  status: SquadStatus;
  teamLevel: 'senior' | 'academy';
  started: boolean;
  willPlay: boolean;
  plannedMinutes: number;
}

/** Canonical pre-match projection shared by importance selection and match simulation. */
export const projectFixtureParticipation = (
  career: CareerState,
  fixture: Fixture,
): ParticipationProjection => {
  const fixtureIndex =
    career.careerCalendar?.fixtures.findIndex((item) => item.id === fixture.id) ?? 0;
  const selection = evaluateSquadOpportunity(career, {
    fixtureIndex,
    fixtureId: fixture.id,
    opponent: fixture.opponent,
    venue: fixture.venue,
  });
  const available = getPlayerAvailability(career, fixture.date).available;
  const started = available && selection.status.endsWith('starter');
  const bench = available && selection.status.endsWith('bench');
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:${career.currentSeason}:${fixture.id}:participation`,
  );
  const enters = bench && rng.bool(0.7);
  return {
    status: selection.status,
    teamLevel:
      career.leagueSeason?.competition.category === 'professional' ||
      selection.status.startsWith('senior')
        ? 'senior'
        : 'academy',
    started,
    willPlay: started || enters,
    plannedMinutes: started ? rng.int(72, 90) : enters ? rng.int(8, 35) : 0,
  };
};

export const getCurrentClubCompetitiveProfile = (career: CareerState): ClubCompetitiveProfile => {
  if (career.leagueSeason?.competition.category !== 'professional') return VISTULA_NOVA_PROFILE;
  const strength =
    career.leagueSeason.clubs.find((club) => club.clubId === career.currentClub.id)?.strength ??
    career.currentClub.prestige;
  const rng = RandomGenerator.fromSeed(`${career.seed}:${career.currentClub.id}:depth`);
  const unit = (): ClubCompetitiveProfile['positionalUnits']['attack'] => ({
    starterQuality: Math.max(35, Math.min(85, strength + rng.int(-4, 5))),
    backupQuality: Math.max(30, strength - rng.int(5, 11)),
    depth: rng.pick(['thin', 'normal', 'deep'] as const),
  });
  return {
    overallStrength: strength,
    positionalUnits: { goalkeeper: unit(), defense: unit(), midfield: unit(), attack: unit() },
  };
};

export const getCurrentCoachSelectionProfile = (career: CareerState): CoachSelectionProfile => {
  if (career.leagueSeason?.competition.category !== 'professional') return TOMASZ_RADECKI_PROFILE;
  const coach = career.significantPeople.find(
    (person) => person.role === 'coach' && person.clubId === career.currentClub.id,
  );
  const rng = RandomGenerator.fromSeed(
    `${career.seed}:${coach?.id ?? career.currentClub.id}:selection`,
  );
  return {
    youthTrust: rng.int(25, 90),
    experiencePreference: rng.int(25, 90),
    tacticalDiscipline: rng.int(35, 92),
    formSensitivity: rng.int(35, 90),
    potentialPatience: rng.int(25, 90),
    riskTolerance: rng.int(20, 85),
  };
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
const footballDecisions: Record<PositionGroup, MatchDecision[]> = {
  outfield: [],
  attacker: [
    decision(
      'dribble',
      'Spróbuj dryblingu',
      'Podejmij obrońcę.',
      'Możesz otworzyć drogę do bramki.',
      'Strata uruchomi kontrę.',
      { technique: 0.4, pace: 0.35, composure: 0.25 },
      13,
      2,
    ),
    decision(
      'progressive_pass',
      'Zagraj prostopadle',
      'Poszukaj ruchu partnera.',
      'Możesz stworzyć czystą okazję.',
      'Podanie może zostać przecięte.',
      { vision: 0.4, technique: 0.35, composure: 0.25 },
      9,
      0,
      2,
      1,
    ),
    decision(
      'shot',
      'Oddaj strzał',
      'Szybko zakończ akcję.',
      'Możesz zdobyć bramkę.',
      'Niecelna próba zakończy atak.',
      { finishing: 0.45, composure: 0.3, technique: 0.25 },
      14,
      3,
    ),
  ],
  midfielder: [
    decision(
      'progressive_pass',
      'Zagraj progresywnie między liniami',
      'Przyspiesz atak podaniem.',
      'Możesz ominąć linię pomocy.',
      'Rywal może przejąć trudne podanie.',
      { vision: 0.42, technique: 0.33, composure: 0.25 },
      10,
      1,
      2,
    ),
    decision(
      'switch_play',
      'Przenieś ciężar gry na drugą stronę',
      'Wykorzystaj wolną przestrzeń.',
      'Drużyna rozciągnie obronę.',
      'Wolne podanie pozwoli rywalom się przesunąć.',
      { vision: 0.45, technique: 0.3, composure: 0.25 },
      7,
      0,
      2,
      1,
    ),
    decision(
      'counterpress',
      'Doskok po stracie',
      'Natychmiast zaatakuj piłkę.',
      'Możesz odzyskać ją wysoko.',
      'Minięcie otworzy środek pola.',
      { stamina: 0.4, defending: 0.32, composure: 0.28 },
      12,
      1,
      1,
      2,
    ),
  ],
  defender: [
    decision(
      'step_out',
      'Wyjdź agresywnie do rywala',
      'Skróć mu czas na decyzję.',
      'Możesz przerwać akcję wcześnie.',
      'Rywal może zagrać za twoje plecy.',
      { defending: 0.42, pace: 0.3, composure: 0.28 },
      13,
      1,
      1,
    ),
    decision(
      'retreat',
      'Cofnij się i zamknij przestrzeń',
      'Broń strefy przed bramką.',
      'Zyskasz czas na asekurację.',
      'Rywal zachowa piłkę.',
      { defending: 0.42, composure: 0.38, pace: 0.2 },
      6,
      0,
      2,
      2,
    ),
    decision(
      'safe_clearance',
      'Wybij bez ryzyka',
      'Usuń piłkę ze strefy zagrożenia.',
      'Natychmiast oddalisz niebezpieczeństwo.',
      'Drużyna straci posiadanie.',
      { defending: 0.5, composure: 0.35, technique: 0.15 },
      4,
      -1,
      1,
      2,
    ),
  ],
  goalkeeper: [
    decision(
      'close_angle',
      'Skróć kąt',
      'Wyjdź naprzeciw strzelca.',
      'Zmniejszysz mu dostępną bramkę.',
      'Lob lub minięcie zostawi pustą bramkę.',
      { composure: 0.45, pace: 0.3, defending: 0.25 },
      12,
      2,
    ),
    decision(
      'hold_line',
      'Zostań na linii',
      'Reaguj dopiero na strzał.',
      'Zachowasz czas na reakcję.',
      'Strzelec może podejść bliżej.',
      { composure: 0.5, technique: 0.25, pace: 0.25 },
      7,
      0,
      1,
      1,
    ),
    decision(
      'safe_parry',
      'Sparuj w bezpieczne miejsce',
      'Odbij piłkę poza środek bramki.',
      'Ograniczysz szansę na dobitkę.',
      'Trudna piłka może wrócić pod nogi rywala.',
      { composure: 0.42, technique: 0.3, defending: 0.28 },
      9,
      1,
      1,
    ),
  ],
};
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
  ['gk_screened_low', 'goalkeeper', 'Płaski strzał zza zasłony'],
  ['gk_one_on_one', 'goalkeeper', 'Napastnik wychodzi sam na sam'],
  ['gk_sweeper', 'goalkeeper', 'Piłka spada za linię obrony'],
  ['gk_fast_restart', 'goalkeeper', 'Otwiera się szybkie wznowienie'],
  ['gk_feet_press', 'goalkeeper', 'Rywal pressuje twoje rozegranie nogami'],
  ['def_touchline', 'defender', 'Skrzydłowy izoluje cię przy linii'],
  ['def_blind_run', 'defender', 'Napastnik rusza za twoje plecy'],
  ['def_second_ball', 'defender', 'Druga piłka spada przed polem karnym'],
  ['def_build_press', 'defender', 'Pressing zamyka krótkie wyprowadzenie'],
  ['def_set_piece', 'defender', 'Stały fragment wymaga ścisłego krycia'],
  ['mid_between_lines', 'midfielder', 'Przyjmujesz piłkę między liniami'],
  ['mid_switch', 'midfielder', 'Druga strona boiska zostaje wolna'],
  ['mid_counterpress', 'midfielder', 'Po stracie możesz natychmiast doskoczyć'],
  ['mid_counter_cover', 'midfielder', 'Musisz zabezpieczyć rodzącą się kontrę'],
  ['mid_long_shot', 'midfielder', 'Masz miejsce na strzał z dystansu'],
  ['mid_late_run', 'midfielder', 'Otwiera się wejście w pole karne'],
  ['att_isolation', 'attacker', 'Zostajesz jeden na jednego z obrońcą'],
  ['att_inside', 'attacker', 'Możesz zejść ze skrzydła do środka'],
  ['att_cross', 'attacker', 'Partnerzy atakują pole karne'],
  ['att_cutback', 'attacker', 'Dochodzi do zagrania spod linii końcowej'],
  ['att_better_teammate', 'attacker', 'Kolega jest ustawiony lepiej od ciebie'],
  ['att_defender_press', 'attacker', 'Stoper przyjmuje piłkę tyłem do gry'],
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
    decisions: footballDecisions[group],
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
      decisions: footballDecisions.midfielder,
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
  homeGoals: (match.goalEvents ?? goalsFromMomentum(match)).filter(
    (event) => event.minute <= minute && event.scoringSide === 'home',
  ).length,
  awayGoals: (match.goalEvents ?? goalsFromMomentum(match)).filter(
    (event) => event.minute <= minute && event.scoringSide === 'away',
  ).length,
});
const goalsFromMomentum = (match: MatchState) =>
  (match.momentum ?? []).flatMap((point, index) =>
    point.event === 'goal' && point.scoringSide
      ? [
          {
            id: `${match.id}:background:${index}`,
            minute: point.minute,
            scoringSide: point.scoringSide,
            source: 'background' as const,
          },
        ]
      : [],
  );
const startConfiguredMatch = (
  career: CareerState,
  fixture: Fixture,
  projected: ParticipationProjection,
): CareerState => {
  if (career.activeMatch) return career;
  const i = career.careerCalendar?.fixtures.findIndex((item) => item.id === fixture.id) ?? 0;
  const opponent = fixture.opponent;
  const venue = fixture.venue;
  const namespace = `${career.seed}:${career.currentSeason}:${fixture.id}:match`;
  const rng = RandomGenerator.fromSeed(namespace);
  const started = projected.started;
  const plannedMinutes = projected.plannedMinutes;
  const teamLevel = projected.teamLevel;
  const importance = fixture.matchImportance;
  const count =
    plannedMinutes === 0
      ? 0
      : importance === 'major' || importance === 'career_defining'
        ? plannedMinutes <= 15
          ? rng.int(1, 2)
          : plannedMinutes <= 45
            ? rng.int(2, 3)
            : rng.int(3, Math.min(5, Math.max(3, Math.floor(plannedMinutes / 18))))
        : plannedMinutes <= 25
          ? 1
          : plannedMinutes <= 60
            ? rng.int(1, 2)
            : 2;
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
    `${namespace}:opening`,
    VISTULA_NOVA_PROFILE.overallStrength,
    opponent.strength,
    venue,
  );
  const activeMatch: MatchState = {
    id: fixture.id,
    fixtureIndex: i,
    date: fixture.date,
    competition: fixture.competition,
    teamLevel,
    opponent,
    venue,
    squadStatus: projected.status,
    currentMinute: 0,
    homeGoals: 0,
    awayGoals: 0,
    playerMinutes: 0,
    plannedMinutes,
    moments,
    resolvedMoments: [],
    teamStats: feedback.teamStats,
    momentum: feedback.momentum,
    goalEvents: feedback.momentum.flatMap((point, index) =>
      point.event === 'goal' && point.scoringSide
        ? [
            {
              id: `${fixture.id}:background:${index}`,
              minute: point.minute,
              scoringSide: point.scoringSide,
              source: 'background' as const,
            },
          ]
        : [],
    ),
    completed: false,
  };
  return { ...career, activeMatch };
};

/** Starts an interactive match for an arbitrary generated fixture. */
export const startFixtureMatch = (career: CareerState, fixture: Fixture): CareerState => {
  if (career.activeMatch) return career;
  const projection = projectFixtureParticipation(career, fixture);
  return projection.willPlay ? startConfiguredMatch(career, fixture, projection) : career;
};

export const resolveMatchDecision = (career: CareerState, decisionId: string): CareerState => {
  const match = career.activeMatch;
  if (!match || match.completed) return career;
  // The append-only result count is authoritative. currentMoment is only a UI cursor and may be
  // stale in an old save or in a callback rendered immediately before another transition.
  const expectedMoment = match.moments[match.resolvedMoments.length];
  const moment = expectedMoment ?? match.currentMoment;
  if (!moment) return finishMatch(career);
  const def = MATCH_MOMENT_LIBRARY.find((m) => m.id === moment.definitionId);
  const choice = def?.decisions.find((d) => d.id === decisionId);
  // Runtime match cursors are disposable. If content changed or a stale button is submitted,
  // settle the already simulated match rather than leaving the career behind an unusable card.
  if (!def || !choice)
    return finishMatch({ ...career, activeMatch: { ...match, currentMoment: undefined } });
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
    goals:
      attacker && tier === 'excellent' && ['shot', 'dribble'].includes(choice.id) && rng.bool(0.45)
        ? 1
        : 0,
    assists:
      !goalkeeper &&
      tier === 'excellent' &&
      ['progressive_pass', 'switch_play'].includes(choice.id) &&
      rng.bool(0.35)
        ? 1
        : 0,
    xG: attacker && ['shot', 'dribble'].includes(choice.id) ? 0.18 : goalkeeper ? 0 : 0.03,
    xA: ['progressive_pass', 'switch_play'].includes(choice.id) && !goalkeeper ? 0.14 : 0.02,
    keyPasses: ['progressive_pass', 'switch_play'].includes(choice.id) && level > 0 ? 1 : 0,
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
  const playerGoalEvents = Array.from({ length: result.goals }, (_, index) => ({
    id: `${match.id}:player:${match.resolvedMoments.length}:${index}`,
    minute: moment.minute,
    scoringSide: match.venue,
    source: 'player' as const,
  }));
  const ledger = [...(match.goalEvents ?? goalsFromMomentum(match)), ...playerGoalEvents];
  const updated = {
    ...match,
    goalEvents: ledger,
    ...scoreAtMinute({ ...match, goalEvents: ledger }, moment.minute),
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
  if (next && !MATCH_MOMENT_LIBRARY.some((definition) => definition.id === next.definitionId))
    return finishMatch({ ...career, activeMatch: { ...m, currentMoment: undefined } });
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
  const ledger = m.goalEvents ?? goalsFromMomentum(m);
  const { homeGoals: home, awayGoals: away } = scoreAtMinute({ ...m, goalEvents: ledger }, 120);
  const rating = evaluateMatchRating({
    position: career.player.primaryPosition,
    minutes: m.plannedMinutes,
    results: m.resolvedMoments,
    goalsFor: m.venue === 'home' ? home : away,
    goalsAgainst: m.venue === 'home' ? away : home,
  });
  const rawAppearance: MatchAppearance = {
    matchId: m.teamLevel === 'academy' && career.leagueSeason ? `academy_${m.id}` : m.id,
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
  const effects = applyMatchAvailabilityEffects(career, rawAppearance, m.date);
  const appearance = effects.appearance;
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
  if (
    m.teamLevel === 'senior' &&
    appearance.started &&
    !(career.matchHistory ?? []).some((a) => a.teamLevel === 'senior' && a.started)
  )
    facts.push(
      makeFact(
        career,
        'first_senior_start',
        m.date,
        { matchId: m.id, minutes: appearance.minutes },
        92,
      ),
    );
  facts.push(
    makeFact(career, 'interactive_match', m.date, { matchId: m.id, teamLevel: m.teamLevel }, 20),
  );
  const priorLevel = (career.matchHistory ?? []).filter((a) => a.teamLevel === m.teamLevel);
  const levelName = m.teamLevel === 'senior' ? 'senior' : 'academy';
  if (appearance.goals > 0 && !priorLevel.some((a) => a.goals > 0))
    facts.push(
      makeFact(
        career,
        `first_${levelName}_goal`,
        m.date,
        { matchId: m.id },
        m.teamLevel === 'senior' ? 92 : 68,
      ),
    );
  if (appearance.assists > 0 && !priorLevel.some((a) => a.assists > 0))
    facts.push(
      makeFact(
        career,
        `first_${levelName}_assist`,
        m.date,
        { matchId: m.id },
        m.teamLevel === 'senior' ? 88 : 65,
      ),
    );
  const load = m.plannedMinutes + career.player.matchEffort * 8;
  const completedCareer: CareerState = {
    ...effects.career,
    player: {
      ...career.player,
      fitness: Math.max(
        0,
        career.player.fitness - Math.round(m.plannedMinutes / 18) + (load < 65 ? 2 : 0),
      ),
    },
    matchHistory: [...(career.matchHistory ?? []), appearance],
    historyFacts: [...career.historyFacts, ...facts, ...effects.facts],
    activeMatch: {
      ...m,
      homeGoals: home,
      awayGoals: away,
      playerMinutes: m.plannedMinutes,
      currentMinute: 90,
      completed: true,
      ...(rating !== undefined ? { liveRating: rating } : {}),
      goalEvents: ledger,
    },
  };
  const roundIndex =
    completedCareer.leagueSeason?.rounds.findIndex((round) =>
      round.fixtures.some((fixture) => fixture.id === m.id),
    ) ?? -1;
  const settled =
    roundIndex >= 0
      ? settleLeagueRound(
          completedCareer,
          roundIndex,
          m.teamLevel === 'senior'
            ? { homeGoals: home, awayGoals: away, playerAppearanceMatchId: appearance.matchId }
            : undefined,
        )
      : completedCareer;
  const fixture: Fixture = {
    id: m.id,
    seasonId: settled.leagueSeason?.id ?? String(settled.currentSeason),
    date: m.date,
    competition: 'league',
    opponent: m.opponent,
    venue: m.venue,
    importance: 0,
    matchImportance: 'notable',
  };
  const withLedger = recordParticipation(
    settled,
    participationFromAppearance(settled, fixture, appearance, m.plannedMinutes),
  );
  return evaluatePlayStyleUnlocks(
    applyAppearanceConsequences(
      {
        ...withLedger,
        selectionStanding: updateSelectionStanding(withLedger.selectionStanding, appearance.rating),
      },
      appearance,
    ),
    m.date,
  );
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
