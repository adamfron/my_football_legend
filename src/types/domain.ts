export type Id = string;
export type PersistenceLevel = 'ephemeral' | 'local' | 'career';
export type Visibility = 'hidden' | 'partial' | 'public';
export type EmotionalTone = 'positive' | 'neutral' | 'negative' | 'bittersweet';

export interface RelationshipScores {
  liking: number;
  trust: number;
  respect: number;
  rivalry: number;
  resentment: number;
  gratitude: number;
  professionalDependence: number;
}

export interface FaceGenome {
  headProportion: number;
  jawWidth: number;
  chinLength: number;
  eyeSpacing: number;
  eyeSize: number;
  browShape: number;
  noseLength: number;
  noseWidth: number;
  mouthWidth: number;
  earSize: number;
  skinTone: number;
  eyeColor: number;
  hairColor: number;
  hairstyle: number;
  facialHair: number;
  ageSigns: number;
  accessories: number;
}

export interface PlayerAttributes {
  technique: number;
  vision: number;
  pace: number;
  stamina: number;
  finishing: number;
  defending: number;
  leadership: number;
  composure: number;
}

export interface Player {
  id: Id;
  firstName: string;
  lastName: string;
  age: number;
  nationality: string;
  heightCm: number;
  weightKg: number;
  attributes: PlayerAttributes;
  traits: string[];
  archetypeId: Id;
  careerPremiseId: Id;
  potential: number;
  primaryPosition: string;
  secondaryPositions: string[];
  positionFamiliarity: Record<string, number>;
  preferredRoles: string[];
  fitness: number;
  health: number;
  morale: number;
  reputation: number;
}

export interface Person {
  id: Id;
  firstName: string;
  lastName: string;
  role: string;
  nationality: string;
  age: number;
  personality: string[];
  clubId?: Id | undefined;
  persistence: PersistenceLevel;
  relationshipParameters: RelationshipScores;
  faceSeed: string;
  faceGenome?: FaceGenome | undefined;
  narrativeTags: string[];
}

export interface ClubSeasonHistory {
  season: number;
  summary: string;
  placement?: number | undefined;
}
export interface Club {
  id: Id;
  name: string;
  country: string;
  region: string;
  dna: string[];
  currentSituation: string;
  playStyle: string;
  youthApproach: string;
  prestige: number;
  seasonHistory: ClubSeasonHistory[];
  notablePlayers: Id[];
  notableCoaches: Id[];
  legends: Id[];
  rivals: Id[];
}

export type PositionGroup = 'goalkeeper' | 'defender' | 'midfielder' | 'attacker' | 'outfield';
export interface DecisionAvailability {
  positions?: string[];
  positionGroups?: PositionGroup[];
  requiredFacts?: string[];
  excludedFacts?: string[];
  requiredTags?: string[];
}
export interface EventDecision {
  id: Id;
  labelKey: string;
  descriptionKey: string;
  visiblePros: string[];
  visibleCons: string[];
  availability?: DecisionAvailability;
}
export interface HiddenTest {
  id: Id;
  attribute: string;
  difficulty: number;
  successChanceModifier?: number | undefined;
}
export interface EventConsequence {
  id: Id;
  type: string;
  data: Record<string, unknown>;
  factType?: string | undefined;
}
export interface EventDefinition {
  id: Id;
  version: number;
  category: string;
  tags: string[];
  availabilityConditions: string[];
  cast: string[];
  playerInformationKeys: string[];
  decisions: EventDecision[];
  hiddenTests: HiddenTest[];
  consequences: EventConsequence[];
  nextEventIds: Id[];
  localizationKeys: { title: string; summary: string };
}

export interface EventInstance {
  id: Id;
  definitionId: Id;
  context: Record<string, unknown>;
  cast: Record<string, Id>;
  selectedDecisionId?: Id | undefined;
  randomState: string;
  result?: Record<string, unknown> | undefined;
  createdFactIds: Id[];
  threadChanges: Record<Id, string>;
}

export interface HistoryFact {
  id: Id;
  factType: string;
  season: number;
  date: string;
  actors: Id[];
  targets: Id[];
  clubs: Id[];
  competitions: string[];
  data: Record<string, unknown>;
  causes: Id[];
  tags: string[];
  visibility: Visibility;
  narrativeImportance: number;
  emotionalTone: EmotionalTone;
}

export interface StoryThread {
  id: Id;
  threadType: string;
  participants: Id[];
  relatedFactIds: Id[];
  status: 'open' | 'dormant' | 'closed';
  tension: number;
  importance: number;
  openedSeason: number;
  lastActivitySeason: number;
  recallTags: string[];
}

export interface CareerState {
  seed: string;
  currentSeason: number;
  careerSeasonNumber: number;
  player: Player;
  currentClub: Club;
  previousClubIds: Id[];
  significantPeople: Person[];
  relationships: Record<Id, RelationshipScores>;
  historyFacts: HistoryFact[];
  storyThreads: StoryThread[];
  statistics: Record<string, number>;
  activeEvent?: EventInstance | undefined;
  finances?: FinancialTransaction[] | undefined;
  developmentProgress?: AttributeDevelopmentProgress[] | undefined;
  augustPlanning?: AugustPlanningState | undefined;
  september?: SeptemberState | undefined;
  activeMatch?: MatchState | undefined;
  matchHistory?: MatchAppearance[] | undefined;
  careerCalendar?: CareerCalendarState | undefined;
  recentVariantKeys?: string[] | undefined;
  leagueSeason?: LeagueSeason | undefined;
  decisionPoint?: PlayerDecisionPoint | undefined;
  fastForwardLog?: FastForwardEntry[] | undefined;
  playerAvailability?: PlayerAvailabilityState | undefined;
  seasonOutcome?: SeasonOutcome | undefined;
  seasonStartingAttributes?: PlayerAttributes | undefined;
  currentContract?: Contract | undefined;
  professionalOffers?: ProfessionalOffer[] | undefined;
  careerPhase?: SeasonPhase | undefined;
  /** Authoritative, monotonic simulation frontier (decision dates are descriptive only). */
  currentDate?: string | undefined;
  currentProfessionalClub?: ProfessionalClub | undefined;
  currentSportingStatus?: SquadRole | undefined;
  careerStatus?: 'active' | 'retired' | undefined;
  retirementDate?: string | undefined;
  retirementAge?: number | undefined;
  retirementReason?: string | undefined;
  highestOVR?: number | undefined;
  highestOVRDate?: string | undefined;
}

export type CareerStage =
  | 'academy'
  | 'prospect'
  | 'developing'
  | 'prime'
  | 'experienced'
  | 'veteran';
export type InjurySeverity = 'knock' | 'minor' | 'moderate' | 'major';
export interface PlayerInjury {
  id: Id;
  startDate: string;
  severity: InjurySeverity;
  matchesRemaining: number;
  source: 'match' | 'training' | 'overload';
  status: 'active' | 'recovered';
  bodyArea?: string | undefined;
}
export interface PlayerAvailabilityState {
  injuries: PlayerInjury[];
  suspensionMatchesRemaining: number;
  leagueYellowCards: number;
  matchesMissedThroughSuspension: number;
  matchesMissedThroughInjury: number;
}
export interface SeasonOutcome {
  finalPosition: number;
  champion: boolean;
  competitionType: 'academy' | 'professional';
  promoted?: boolean | undefined;
  relegated?: boolean | undefined;
}

export type SeasonPhase =
  | 'academy'
  | 'preseason'
  | 'regular_season'
  | 'summer_window'
  | 'offseason';
export type ClubArchetype =
  | 'YOUTH_TRADER'
  | 'RESULTS_FIRST'
  | 'LOCAL_DEVELOPMENT'
  | 'TECHNICAL_ACADEMY'
  | 'UNDERDOG'
  | 'AMBITIOUS_CLIMBER';
export type SquadRole =
  | 'development_player'
  | 'rotation'
  | 'first_team_competition'
  | 'important_player';
export interface PositionalNeed {
  starterQuality: number;
  depth: 'thin' | 'normal' | 'deep';
  needLevel: number;
}
export interface ProfessionalClub {
  id: Id;
  name: string;
  country: string;
  region: string;
  professionalLevel: number;
  reputation: number;
  overallStrength: number;
  financialLevel: number;
  playingStyle: string;
  youthPolicy: number;
  developmentReputation: number;
  sellingClubTendency: number;
  pressureLevel: number;
  coachYouthTrust: number;
  archetype: ClubArchetype;
  positionalNeeds: Record<'goalkeeper' | 'defense' | 'midfield' | 'attack', PositionalNeed>;
}
export interface Contract {
  clubId: Id;
  startDate: string;
  endDate: string;
  monthlySalary: number;
  signingBonus: number;
  squadRole: SquadRole;
  contractType: 'professional' | 'development';
}
export interface ProfessionalOffer {
  id: Id;
  offerType?: 'external' | 'renewal';
  club: ProfessionalClub;
  contract: Contract;
  interestReasons: string[];
  opportunity: string;
  risk: string;
  competitionAssessment: string;
}

export type CareerWeekPhase = 'academy' | 'preseason' | 'regular_season' | 'winter_break';
export type MatchImportance = 'routine' | 'notable' | 'major' | 'career_defining';
export interface Fixture {
  id: Id;
  seasonId: string;
  date: string;
  competition: 'league' | 'academy_league' | 'friendly';
  opponent: OpponentProfile;
  venue: 'home' | 'away';
  importance: number;
  matchImportance: MatchImportance;
}
export interface LeagueClubProfile {
  clubId: string;
  name: string;
  strength: number;
  attackStrength: number;
  defenseStrength: number;
  form: number;
}
export interface LeagueFixture {
  id: string;
  roundIndex: number;
  date: string;
  homeClubId: string;
  awayClubId: string;
  homeGoals?: number | undefined;
  awayGoals?: number | undefined;
  completed: boolean;
  playerAppearanceMatchId?: string | undefined;
}
export interface LeagueRound {
  index: number;
  date: string;
  fixtures: LeagueFixture[];
  completed: boolean;
}
export interface LeagueSeason {
  id: string;
  name: string;
  competition: CompetitionProfile;
  controlledClubId: Id;
  startDate: string;
  endDate: string;
  clubIds: string[];
  clubs: LeagueClubProfile[];
  rounds: LeagueRound[];
  currentRound: number;
  completed: boolean;
}
export interface CompetitionProfile {
  id: Id;
  name: string;
  country: string;
  category: 'youth' | 'professional';
  ageLevel?: 'U17' | 'U19' | 'U21' | undefined;
  tier?: number | undefined;
}
export interface LeagueTableRow {
  position: number;
  clubId: string;
  clubName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
export type DecisionPointType =
  | 'important_match'
  | 'off_field_event'
  | 'relationship_event'
  | 'development_event'
  | 'season_context'
  | 'checkpoint';
export interface PlayerDecisionPoint {
  type: DecisionPointType;
  date: string;
  sourceId: string;
}
export interface FastForwardEntry {
  id: string;
  date: string;
  type: 'match' | 'quiet_week' | 'event';
  summary: string;
  fixtureId?: string | undefined;
  appearanceMatchId?: string | undefined;
}
export interface CareerWeek {
  id: Id;
  seasonId: string;
  weekIndex: number;
  startDate: string;
  endDate: string;
  phase: CareerWeekPhase;
  fixtureIds: Id[];
  scheduledEventIds: Id[];
  completedEventIds: Id[];
  summaryVariantKey?: string | undefined;
  completed: boolean;
}
export interface MonthlyCheckpoint {
  id: Id;
  month: string;
  appearances: number;
  minutes: number;
  goals: number;
  assists: number;
  averageRating?: number | undefined;
  form: PlayerFormBand;
  role: string;
  highlightFactId?: Id | undefined;
}
export interface CareerCalendarState {
  seasonId: string;
  currentWeekIndex: number;
  weeks: CareerWeek[];
  fixtures: Fixture[];
  monthlyCheckpoints: MonthlyCheckpoint[];
  availableThrough: string;
}
export type PlayerFormBand = 'excellent' | 'good' | 'steady' | 'uneven' | 'poor';
export type MilestoneCategory =
  | 'debut'
  | 'goal'
  | 'assist'
  | 'award'
  | 'title'
  | 'transfer'
  | 'role_change'
  | 'record'
  | 'major_relationship'
  | 'career_turning_point';
export interface CareerMilestone {
  fact: HistoryFact;
  category: MilestoneCategory;
}

export interface CareerEventCandidate {
  eventDefinitionId: string;
  weight: number;
  phases: CareerWeekPhase[];
  requiredTags?: string[] | undefined;
  excludedTags?: string[] | undefined;
  requiredFacts?: string[] | undefined;
  excludedFacts?: string[] | undefined;
  requiredPositionGroups?: PositionGroup[] | undefined;
  minWeek?: number | undefined;
  maxWeek?: number | undefined;
  oncePerCareer?: boolean | undefined;
  conflictsWith?: string[] | undefined;
  recallTags: string[];
  relationshipRole?: 'peer' | 'mentor' | 'assistant_coach' | 'physiotherapist' | undefined;
}

export type PlayerPosition =
  | 'goalkeeper'
  | 'center_back'
  | 'full_back'
  | 'defensive_midfielder'
  | 'central_midfielder'
  | 'attacking_midfielder'
  | 'winger'
  | 'striker';
export type SquadStatus =
  | 'senior_starter'
  | 'senior_bench'
  | 'senior_out'
  | 'academy_starter'
  | 'academy_bench'
  | 'no_match';
export type MatchTier = 'excellent' | 'good' | 'mixed' | 'poor' | 'costly';
export interface PositionalUnit {
  starterQuality: number;
  backupQuality: number;
  depth: 'thin' | 'normal' | 'deep';
}
export interface ClubCompetitiveProfile {
  overallStrength: number;
  positionalUnits: Record<'goalkeeper' | 'defense' | 'midfield' | 'attack', PositionalUnit>;
}
export interface CoachSelectionProfile {
  youthTrust: number;
  experiencePreference: number;
  tacticalDiscipline: number;
  formSensitivity: number;
  potentialPatience: number;
  riskTolerance: number;
}
export interface SquadAvailability {
  unit: keyof ClubCompetitiveProfile['positionalUnits'];
  severity: 'full' | 'one_absence' | 'several_absences';
  reason: 'minor_injury' | 'major_injury' | 'suspension' | 'fatigue' | 'none';
}
export interface OpponentProfile {
  id: string;
  name: string;
  strength: number;
  style: string;
  strengths: string[];
  weaknesses: string[];
}
export interface MatchTestWeights {
  attributes: Partial<Record<keyof PlayerAttributes, number>>;
  fitnessWeight?: number;
  moraleWeight?: number;
  pressureWeight?: number;
}
export interface MatchDecision {
  id: string;
  label: string;
  description: string;
  visibleGain: string;
  visibleRisk: string;
  weights: MatchTestWeights;
  risk: number;
  personalBias: number;
  teamBias: number;
  coachBias: number;
}
export interface MatchMomentDefinition {
  id: string;
  positionGroups: PositionGroup[];
  situationTags: string[];
  introductions: string[];
  decisions: MatchDecision[];
}
export interface MatchMoment {
  definitionId: string;
  minute: number;
  scoreFor: number;
  scoreAgainst: number;
  description: string;
}
export interface MatchMomentResult {
  moment: MatchMoment;
  decisionId: string;
  tier: MatchTier;
  personalImpact: number;
  teamImpact: number;
  coachImpact: number;
  narrative: string;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  keyPasses: number;
  defensiveActions: number;
  saves: number;
  behaviorTags?: MatchBehaviorTag[] | undefined;
  ratingBefore?: number | undefined;
  ratingAfter?: number | undefined;
  ratingExplanation?: string | undefined;
}
export type MatchBehaviorTag =
  | 'progressive_pass'
  | 'defensive_read'
  | 'pressure_resistance'
  | 'late_box_run'
  | 'long_shot'
  | 'one_on_one_finish'
  | 'pressing_action'
  | 'goalkeeper_distribution';
export interface MatchTeamStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  xG: number;
  dangerousActions: number;
}
export interface MatchMomentumPoint {
  minute: number;
  homeThreat: number;
  awayThreat: number;
  event?: 'goal' | 'big_chance' | 'substitution' | 'red_card' | undefined;
  scoringSide?: 'home' | 'away' | undefined;
}
export interface MatchGoalEvent {
  id: string;
  minute: number;
  scoringSide: 'home' | 'away';
  source: 'background' | 'player';
}
export interface MatchState {
  id: string;
  fixtureIndex: number;
  date: string;
  competition: string;
  teamLevel: 'senior' | 'academy';
  opponent: OpponentProfile;
  venue: 'home' | 'away';
  squadStatus: SquadStatus;
  currentMinute: number;
  homeGoals: number;
  awayGoals: number;
  playerMinutes: number;
  plannedMinutes: number;
  moments: MatchMoment[];
  currentMoment?: MatchMoment | undefined;
  resolvedMoments: MatchMomentResult[];
  teamStats?: { home: MatchTeamStats; away: MatchTeamStats } | undefined;
  momentum?: MatchMomentumPoint[] | undefined;
  /** Authoritative, append-only scoring history. Legacy saves are hydrated from momentum. */
  goalEvents?: MatchGoalEvent[] | undefined;
  liveRating?: number | undefined;
  completed: boolean;
}
export interface MatchAppearance {
  matchId: string;
  date: string;
  opponentId: string;
  teamLevel: 'senior' | 'academy';
  started: boolean;
  minutes: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  keyPasses: number;
  defensiveActions: number;
  saves: number;
  personalImpact: number;
  rating?: number | undefined;
  yellowCards?: number | undefined;
  redCard?: 'second_yellow' | 'direct' | undefined;
  dismissedMinute?: number | undefined;
  injuryId?: string | undefined;
}
export interface SeasonPlayerSummary {
  appearances: number;
  starts: number;
  substituteAppearances: number;
  minutes: number;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  keyPasses: number;
  defensiveActions: number;
  saves: number;
  averageRating?: number | undefined;
  bestRating?: number | undefined;
  bestMatchId?: string | undefined;
  seniorAppearances: number;
  academyAppearances: number;
}
export type PlayStyleId =
  | 'progressive_passer'
  | 'between_the_lines'
  | 'ball_winner'
  | 'calm_finisher'
  | 'engine'
  | 'goalkeeper_distributor';
export interface PlayStyleUnlock {
  playStyleId: PlayStyleId;
  date: string;
  causes: string[];
  relevantStats: Record<string, number>;
  relatedFacts: string[];
}
export interface AttributeChange {
  attribute: keyof PlayerAttributes;
  before: number;
  after: number;
  date: string;
  source: string;
  causes: string[];
}
export interface SeasonSummary {
  statistics: SeasonPlayerSummary;
  bestMatch?: MatchAppearance;
  majorFacts: HistoryFact[];
  attributeChanges: AttributeChange[];
  unlockedPlayStyles: PlayStyleUnlock[];
}
export interface SeasonContextOpportunity {
  id: string;
  type:
    | 'top_scorer'
    | 'top_assists'
    | 'clean_sheets'
    | 'young_player'
    | 'title'
    | 'promotion'
    | 'survival'
    | 'club_record';
  roundsRemaining: number;
  gapToLeader?: number;
}
export interface ClubStrengthChangedData {
  reason:
    | 'transfer_in'
    | 'transfer_out'
    | 'squad_availability'
    | 'development'
    | 'decline'
    | 'coach_change';
  previousBand: string;
  currentBand: string;
}
export interface SeptemberState {
  fixtureIndex: number;
  opponents: OpponentProfile[];
  availability: SquadAvailability[];
  completed: boolean;
}

export type FinancialCategory =
  | 'stipend'
  | 'side_job'
  | 'development'
  | 'recovery'
  | 'education'
  | 'lifestyle'
  | 'salary'
  | 'signing_bonus';
export interface FinancialTransaction {
  id: Id;
  date: string;
  amount: number;
  category: FinancialCategory;
  sourceFactId?: Id | undefined;
}
export interface AttributeDevelopmentProgress {
  attribute: keyof PlayerAttributes;
  progress: number;
}
export type AugustActivityId =
  | 'extra_individual_training'
  | 'hire_personal_coach'
  | 'nutrition_consultation'
  | 'education_session'
  | 'food_delivery_shift'
  | 'prioritize_recovery';
export interface AugustWeekResult {
  week: number;
  date: string;
  activityId: AugustActivityId;
  fitnessDelta: number;
  moraleDelta: number;
  development: number;
  overloaded: boolean;
  narrative: string;
  interlude?: string | undefined;
}
export interface AugustPlanningState {
  currentWeek: number;
  startedFitness: number;
  startedMorale: number;
  results: AugustWeekResult[];
  completed: boolean;
}
