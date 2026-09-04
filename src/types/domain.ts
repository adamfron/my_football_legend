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
  firstTouch: number;
  passing: number;
  dribbling: number;
  finishing: number;
  tackling: number;
  heading: number;
  setPieces: number;
  gameReading: number;
  composure: number;
  concentration: number;
  leadership: number;
  determination: number;
  aggression: number;
  pace: number;
  stamina: number;
  strength: number;
  agility: number;
  jumping: number;
  ambition: number;
  professionalism: number;
  reflexes: number;
  handling: number;
  oneOnOnes: number;
  goalkeeperSweeping: number;
}
export interface HiddenPlayerProfile {
  consistency: number;
  importantMatches: number;
  injuryProneness: number;
  adaptability: number;
  loyalty: number;
  pressureResistance: number;
  controversy: number;
  fairPlay: number;
}
export type DevelopmentType = 'early_bloomer' | 'normal' | 'late_bloomer';
export type DevelopmentFamily = 'technical' | 'mental' | 'physical' | 'goalkeeper';
export type NpcDevelopmentCurveId =
  | 'early_peak'
  | 'rapid_start'
  | 'balanced'
  | 'steady'
  | 'late_bloomer'
  | 'long_prime'
  | 'physical_early_mental_late'
  | 'goalkeeper_late_prime';
export interface DevelopmentProfile {
  developmentType: DevelopmentType;
  growthRate: number;
  developmentVolatility: number;
  familyCapacity: Record<DevelopmentFamily, number>;
  familyPeakAge: Record<DevelopmentFamily, number>;
  familyDeclineStartAge: Record<DevelopmentFamily, number>;
  stagnationResistance: number;
  crisisSensitivity: number;
}

/** Canonical Player Model 2.0 card shared by the protagonist and world footballers. */
export interface FootballerProfile {
  id: Id;
  firstName: string;
  lastName: string;
  age: number;
  /** Canonical lifecycle age source. `age` remains as a legacy/derived compatibility field. */
  dateOfBirth?: string | undefined;
  nationality: string;
  heightCm: number;
  weightKg: number;
  attributes: PlayerAttributes;
  hiddenProfile: HiddenPlayerProfile;
  dominantFoot: 'left' | 'right';
  weakFootProficiency: number;
  traits: string[];
  primaryPosition: PlayerPosition;
  secondaryPositions: PlayerPosition[];
  positionFamiliarity: Record<PlayerPosition, number>;
}

export interface Player extends FootballerProfile {
  careerPremiseId: Id;
  fitness: number;
  health: number;
  morale: number;
  reputation: number;
  matchPresentation: MatchPresentation;
  matchEffort: EffortLevel;
  trainingEffort: EffortLevel;
}

export type MatchPresentation = 'important_matches' | 'simulate_all';
export type EffortLevel = 1 | 2 | 3 | 4 | 5;

export interface Person {
  id: Id;
  firstName: string;
  lastName: string;
  role: string;
  nationality: string;
  age: number;
  /** Stable identity fact shared by every present and future career role. */
  dateOfBirth?: string | undefined;
  personality: string[];
  clubId?: Id | undefined;
  persistence: PersistenceLevel;
  relationshipParameters: RelationshipScores;
  faceSeed: string;
  faceGenome?: FaceGenome | undefined;
  narrativeTags: string[];
}

export type TacticalStyle = 'possession' | 'balanced' | 'direct' | 'counter_attacking' | 'pressing';

/** A role profile references a Person identity instead of replacing it. */
export interface CoachProfile {
  id: Id;
  personId: Id;
  dateOfBirth: string;
  nationality: string;
  reputation: number;
  preferredFormation: '4-3-3' | '4-2-3-1' | '4-4-2' | '3-4-2-1' | '3-5-2';
  secondaryFormation?: '4-3-3' | '4-2-3-1' | '4-4-2' | '3-4-2-1' | '3-5-2' | undefined;
  tacticalStyle: TacticalStyle;
  rotationPreference: number;
  youthTrust: number;
  experiencePreference: number;
  positionalFlexibility: number;
  formPatience: number;
  adaptability: number;
}

export interface ClubSeasonHistory {
  season: number;
  summary: string;
  placement?: number | undefined;
}
export interface ClubVisualIdentity {
  primaryColor: string;
  secondaryColor: string;
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
  visualIdentity?: ClubVisualIdentity | undefined;
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
  difficulty?: CareerDifficulty | undefined;
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
  developmentProfile?: DevelopmentProfile | undefined;
  clubWorld?: ProfessionalClub[] | undefined;
  /** Normalized persistent NPC registry. The protagonist is resolved from player instead. */
  footballerWorld?: Record<Id, WorldFootballer> | undefined;
  /** Runtime-only immutable canonical youth-cohort index. */
  youthCohorts?: Record<string, Id[]> | undefined;
  /** Versioned immutable game content used to hydrate this runtime career. */
  worldDatabaseVersion?: string | undefined;
  /** Sparse, persistable mutations over the immutable starting world. */
  worldDelta?: CareerWorldDelta | undefined;
  completedSeasons?: CompletedSeasonSnapshot[] | undefined;
  /** Canonical record for every controlled-club fixture in the current season. */
  seasonParticipation?: SeasonParticipationRecord[] | undefined;
  trainingApproach?: TrainingApproach | undefined;
  trainingPlan?: TrainingPlan | undefined;
  individualFocus?: keyof PlayerAttributes | 'weakFootProficiency' | undefined;
  /** Slow-moving coach confidence, independent from short-term form. */
  selectionStanding?: number | undefined;
  agentPreferences?: AgentPreference[] | undefined;
  renegotiation?: ContractRenegotiationState | undefined;
}

export interface CareerWorldDelta {
  clubOverrides: Record<Id, ProfessionalClub>;
  footballerOverrides: Record<Id, WorldFootballer>;
  /** Attribute-only mutations over the effective footballer; never duplicates identity data. */
  footballerAttributeOverrides?:
    | {
        [footballerId: Id]: { [K in keyof PlayerAttributes]?: PlayerAttributes[K] | undefined };
      }
    | undefined;
  squadOverrides: Record<Id, Id[]>;
  /** Effective youth membership after lifecycle changes; the shipped cohort stays immutable. */
  youthCohortOverrides?: Record<string, Id[]> | undefined;
  newFootballers: Record<Id, WorldFootballer>;
  retiredFootballerIds: Id[];
  managerOverrides: Record<Id, Id>;
  managerMoveRecords?: WorldManagerMoveRecord[] | undefined;
  managerLifecycleProcessedThroughSeason?: number | undefined;
  /** Sparse append-only history of completed NPC moves. */
  npcTransferRecords?: WorldTransferRecord[] | undefined;
  /** Last completed season boundary evaluated for NPC retirement. */
  npcRetirementProcessedThroughSeason?: number | undefined;
  /** Last completed season boundary processed by the bounded NPC summer market. */
  npcTransferMarketProcessedThroughSeason?: number | undefined;
}

export interface WorldManagerMoveRecord {
  id: Id;
  managerId: Id;
  date: string;
  fromClubId?: Id | undefined;
  toClubId?: Id | undefined;
  reason: 'dismissed' | 'appointed';
}

export interface WorldTransferRecord {
  id: Id;
  playerId: Id;
  date: string;
  fromClubId?: Id | undefined;
  toClubId: Id;
  transferType: 'free' | 'transfer';
  fee: number;
  contractEndDate: string;
}

export interface WorldDatabase {
  version: string;
  startingSeason: number;
  seed: string;
  clubs: ProfessionalClub[];
  footballers: Record<Id, WorldFootballer>;
  /** Reserved for shipped or separately lazy-loaded canonical cohorts. */
  youthCohorts: Record<string, Id[]>;
}

/** Small authored identity for a youth side; parent-club context remains derived. */
export interface YouthTeamDefinition {
  id: Id;
  parentClubId?: Id | undefined;
  independentName?: string | undefined;
  independentQuality?: number | undefined;
  coachId: Id;
}

export type ParticipationStatus =
  | 'starter'
  | 'substitute'
  | 'unused_bench'
  | 'not_selected'
  | 'injured'
  | 'suspended'
  | 'unfit'
  | 'unavailable';
export type TrainingApproach = 'recovery' | 'balanced' | 'extra_work';
export type CareerDifficulty = 'easy' | 'normal' | 'hard';
export type TrainingPlan =
  | 'general'
  | 'technical'
  | 'playmaking'
  | 'dribbling'
  | 'finishing'
  | 'tackling'
  | 'aerial'
  | 'physical'
  | 'set_pieces'
  | 'goalkeeper'
  | 'sweeper_keeper'
  | 'weak_foot';
export interface SeasonParticipationRecord {
  fixtureId: string;
  seasonId?: string | undefined;
  competitionId?: string | undefined;
  date: string;
  homeClubId?: string | undefined;
  awayClubId?: string | undefined;
  fixtureStatus?: 'scheduled' | 'completed' | 'postponed' | undefined;
  score?: { home: number; away: number } | undefined;
  opponentId: string;
  venue: 'home' | 'away';
  competition: string;
  status: ParticipationStatus;
  plannedMinutes: number;
  minutes: number;
  started: boolean;
  /** Formation slot actually assigned by the manager; absent means the player did not play. */
  assignedPosition?: PlayerPosition | undefined;
  appearanceMatchId?: string | undefined;
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  keyPasses?: number | undefined;
  defensiveActions?: number | undefined;
  yellowCards?: number | undefined;
  redCard?: 'second_yellow' | 'direct' | undefined;
  goalkeeperStats?: GoalkeeperMatchStats | undefined;
  rating?: number | undefined;
}

export interface GoalkeeperMatchStats {
  goalsConceded: number;
  shotsOnTargetFaced: number;
  saves: number;
  savePercentage: number;
  cleanSheet: boolean;
  xGA: number;
  errorsLeadingToGoal: number;
  rating: number;
  crossesClaimed?: number | undefined;
  sweeperActions?: number | undefined;
  distributionCompleted?: number | undefined;
  distributionAttempted?: number | undefined;
  /** False on migrated fixtures whose historical detail cannot be reconstructed safely. */
  detailsAvailable?: boolean | undefined;
}

export interface CompletedSeasonSnapshot {
  seasonId: string;
  seasonNumber: number;
  label: string;
  age: number;
  clubId: Id;
  clubName: string;
  leagueLevel: number;
  leagueName: string;
  leagueTier?: number | undefined;
  clubFinish: number;
  clubPoints: number;
  clubRecord: { won: number; drawn: number; lost: number };
  goalsFor: number;
  goalsAgainst: number;
  player: {
    appearances: number;
    starts: number;
    minutes: number;
    goals: number;
    assists: number;
    xG: number;
    xA: number;
    keyPasses: number;
    defensiveActions: number;
    averageRating: number;
    yellowCards: number;
    redCards: number;
    missedBySuspension: number;
    missedByInjury: number;
  };
  development: {
    seasonStartAttributes: PlayerAttributes;
    seasonEndAttributes: PlayerAttributes;
    seasonStartOVR: number;
    seasonEndOVR: number;
  };
  /** Frozen canonical controlled-club fixture ledger. */
  fixtures: SeasonParticipationRecord[];
  milestones: Id[];
  seasonResult?: 'promoted' | 'relegated' | 'stayed' | 'champion' | undefined;
}

export type CareerStage =
  | 'academy'
  | 'prospect'
  | 'developing'
  | 'prime'
  | 'experienced'
  | 'veteran';
export type InjurySeverity = 'knock' | 'minor' | 'moderate' | 'major';
export type InjuryType =
  | 'bruise'
  | 'strain'
  | 'sprain'
  | 'muscle_overload'
  | 'joint_injury'
  | 'concussion';
export interface PlayerInjury {
  id: Id;
  startDate: string;
  severity: InjurySeverity;
  injuryType: InjuryType;
  matchesRemaining: number;
  source: 'match' | 'training' | 'overload';
  status: 'active' | 'recovered';
  recoveryDate?: string | undefined;
  bodyArea?: string | undefined;
}
export interface PlayerAvailabilityState {
  injuries: PlayerInjury[];
  suspensionMatchesRemaining: number;
  leagueYellowCards: number;
  matchesMissedThroughSuspension: number;
  matchesMissedThroughInjury: number;
  /** Match effects already committed to the career; prevents duplicate bans and injuries. */
  processedMatchIds?: string[] | undefined;
}
export interface SeasonOutcome {
  finalPosition: number;
  champion: boolean;
  competitionType: 'academy' | 'professional';
  promoted?: boolean | undefined;
  relegated?: boolean | undefined;
  previousLeagueTier?: 1 | 2 | 3 | 4 | undefined;
  nextLeagueTier?: 1 | 2 | 3 | 4 | undefined;
  leagueOutcome?: 'promoted' | 'relegated' | 'stayed' | 'champion' | undefined;
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
  | 'important_player'
  | 'star_player';
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
  shortName?: string | undefined;
  managerId?: Id | undefined;
  philosophyTags?: string[] | undefined;
  /** Canonical Polish pyramid tier (1 is strongest). */
  leagueTier: 1 | 2 | 3 | 4;
  /** Legacy save field; new simulation code uses leagueTier. */
  reputation: number;
  /** Canonical first-team quality on the shared 0..100 scale. */
  strengthRating?: number | undefined;
  /** Legacy save field; read only by migration/fallback helpers. */
  overallStrength?: number | undefined;
  financialLevel: number;
  playingStyle: string;
  youthPolicy: number;
  developmentReputation: number;
  sellingClubTendency: number;
  pressureLevel: number;
  coachYouthTrust: number;
  /** Stable facilities and staff quality; distinct from current team strength. */
  infrastructure?: ClubInfrastructure | undefined;
  archetype: ClubArchetype;
  positionalNeeds: Record<'goalkeeper' | 'defense' | 'midfield' | 'attack', PositionalNeed>;
  visualIdentity?: ClubVisualIdentity | undefined;
  /** Normalized first-team membership; never contains embedded footballer cards. */
  squadPlayerIds?: Id[] | undefined;
}
export interface WorldFootballer {
  profile: FootballerProfile;
  developmentProfile: DevelopmentProfile;
  /** Shared natural-development trajectory; absent only in legacy world data. */
  developmentCurveId?: NpcDevelopmentCurveId | undefined;
  careerStatus: 'active' | 'retired';
  currentClubId?: Id | undefined;
  reputation?: number | undefined;
  fitness?: number | undefined;
  /** Persistent contract fact; payroll simulation deliberately remains protagonist-only. */
  currentContract?: Contract | undefined;
}
export interface ClubInfrastructure {
  coachingQuality: number;
  trainingFacilities: number;
  medicalQuality: number;
  scoutingQuality: number;
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
export type AgentPreference =
  | 'sporting_level'
  | 'important_role'
  | 'development'
  | 'salary'
  | 'infrastructure';
export interface ContractRenegotiationState {
  season: number;
  result: 'accepted' | 'conditional' | 'rejected';
  proposedContract?: Contract | undefined;
}
export interface ProfessionalOffer {
  id: Id;
  offerType?: 'external' | 'renewal' | undefined;
  club: ProfessionalClub;
  contract: Contract;
  /** Destination manager's present intent, independent of the contractual squad role. */
  plannedPosition: PlayerPosition;
  alternativePositions?: PlayerPosition[] | undefined;
  interestReasons: string[];
  opportunity: string;
  risk: string;
  competitionAssessment: string;
  transferKind?: 'free' | 'fee' | undefined;
  estimatedTransferFee?: number | undefined;
}

export type CareerWeekPhase = 'academy' | 'preseason' | 'regular_season' | 'winter_break';
export type MatchImportance = 'routine' | 'notable' | 'major' | 'career_defining';
export interface Fixture {
  id: Id;
  seasonId: string;
  date: string;
  competition: string;
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
  strengthRating?: number | undefined;
  reputation?: number | undefined;
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
export type CalendarEventStatus = 'scheduled' | 'completed';
export interface ScheduledCalendarEvent {
  id: Id;
  eventDefinitionId: Id;
  date: string;
  status: CalendarEventStatus;
  factId?: Id | undefined;
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
  /** Player-facing simulation date; kept in step with CareerState.currentDate. */
  currentDate: string;
  currentWeekIndex: number;
  weeks: CareerWeek[];
  fixtures: Fixture[];
  scheduledEvents: ScheduledCalendarEvent[];
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
  | 'left_back'
  | 'right_back'
  | 'defensive_midfielder'
  | 'attacking_midfielder'
  | 'left_winger'
  | 'right_winger'
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
  assignedPosition?: PlayerPosition | undefined;
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
  goalkeeperStats?: GoalkeeperMatchStats | undefined;
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
  yellowCards: number;
  redCards: number;
  averageRating?: number | undefined;
  bestRating?: number | undefined;
  bestMatchId?: string | undefined;
  /** @deprecated Legacy presentation fields; appearances is authoritative. */
  seniorAppearances?: number;
  /** @deprecated Legacy presentation fields; appearances is authoritative. */
  academyAppearances?: number;
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
