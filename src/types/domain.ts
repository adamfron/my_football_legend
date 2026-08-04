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

export interface ClubSeasonHistory { season: number; summary: string; placement?: number | undefined }
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

export interface EventDecision { id: Id; labelKey: string; descriptionKey: string; visiblePros: string[]; visibleCons: string[] }
export interface HiddenTest { id: Id; attribute: string; difficulty: number; successChanceModifier?: number | undefined }
export interface EventConsequence { id: Id; type: string; data: Record<string, unknown>; factType?: string | undefined }
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
  player: Player;
  currentClub: Club;
  previousClubIds: Id[];
  significantPeople: Person[];
  relationships: Record<Id, RelationshipScores>;
  historyFacts: HistoryFact[];
  storyThreads: StoryThread[];
  statistics: Record<string, number>;
  activeEvent?: EventInstance | undefined;
}
