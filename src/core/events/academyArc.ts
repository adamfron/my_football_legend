import { sampleClub } from '../../content/clubs/sampleClub';
import { polishAcademyFirstNames, polishAcademyLastNames } from '../../content/names/polishAcademyNames';
import { RandomGenerator } from '../random/RandomGenerator';
import type { CareerState, EventInstance, Person, RelationshipScores, StoryThread } from '../../types/domain';

export const COACH_ID = 'person_marek_wrona';
export const RIVAL_ID = 'person_academy_rival';
export const FIRST_EVENT_ID = 'academy_coach_introduction';
export const WEEK_COMPLETED_FACT_ID = 'fact_academy_first_week_completed';

export const neutralRelationship = (): RelationshipScores => ({ liking: 50, trust: 50, respect: 50, rivalry: 20, resentment: 0, gratitude: 0, professionalDependence: 35 });
export const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
export const mergeRelationship = (base: RelationshipScores, delta: Partial<RelationshipScores>): RelationshipScores => ({ ...base, ...Object.fromEntries(Object.entries(delta).map(([k, v]) => [k, clamp((base[k as keyof RelationshipScores] ?? 0) + (v ?? 0))])) } as RelationshipScores);

export const ensureCoach = (career: CareerState): CareerState => {
  if (career.significantPeople.some((p) => p.id === COACH_ID)) return career;
  const coach: Person = { id: COACH_ID, firstName: 'Marek', lastName: 'Wrona', role: 'coach', nationality: 'PL', age: 46, personality: ['wymagający','odpowiedzialny','uważny'], clubId: sampleClub.id, persistence: 'career', relationshipParameters: neutralRelationship(), faceSeed: `${career.seed}:marek-wrona`, narrativeTags: ['coach','academy_first_week'] };
  return { ...career, significantPeople: [...career.significantPeople, coach], relationships: { ...career.relationships, [COACH_ID]: career.relationships[COACH_ID] ?? neutralRelationship() } };
};

const groupFor = (position: string) => position === 'goalkeeper' ? 'goalkeeper' : ['center_back','full_back'].includes(position) ? 'defender' : ['defensive_midfielder','central_midfielder','attacking_midfielder'].includes(position) ? 'midfielder' : 'forward';
export const generateAcademyRival = (career: CareerState): Person => {
  const rng = RandomGenerator.fromSeed(`${career.seed}:${career.player.primaryPosition}:vistula-nova:rival`);
  const firstName = rng.pick(polishAcademyFirstNames); const lastName = rng.pick(polishAcademyLastNames);
  const personalities = rng.shuffle(['ambitny','zadziorny','pracowity','spokojny','lojalny','pewny siebie']).slice(0, rng.int(2, 3));
  return { id: RIVAL_ID, firstName, lastName, role: 'academy_rival', nationality: 'PL', age: rng.int(16, 18), personality: personalities, clubId: sampleClub.id, persistence: 'local', relationshipParameters: neutralRelationship(), faceSeed: `${career.seed}:rival:${firstName}:${lastName}`, narrativeTags: ['first_rival', `position_group_${groupFor(career.player.primaryPosition)}`, 'academy_first_week'] };
};
export const ensureRival = (career: CareerState): CareerState => {
  if (career.significantPeople.some((p) => p.id === RIVAL_ID)) return career;
  const rival = generateAcademyRival(career);
  return { ...career, significantPeople: [...career.significantPeople, rival], relationships: { ...career.relationships, [RIVAL_ID]: career.relationships[RIVAL_ID] ?? neutralRelationship() } };
};
export const makeEventInstance = (career: CareerState, definitionId = FIRST_EVENT_ID): EventInstance => ({ id: `event_${definitionId}`, definitionId, context: { date: '2026-07-01', stageKey: 'events.academy.stage.first_week' }, cast: { player: career.player.id, coach: COACH_ID, rival: RIVAL_ID }, randomState: RandomGenerator.fromSeed(`${career.seed}:${definitionId}`).export(), createdFactIds: [], threadChanges: {} });
export const upsertThread = (career: CareerState, thread: StoryThread): CareerState => ({ ...career, storyThreads: career.storyThreads.some((t) => t.id === thread.id) ? career.storyThreads.map((t) => t.id === thread.id ? { ...t, ...thread, relatedFactIds: Array.from(new Set([...t.relatedFactIds, ...thread.relatedFactIds])), recallTags: Array.from(new Set([...t.recallTags, ...thread.recallTags])) } : t) : [...career.storyThreads, thread] });
export const hasCompletedAcademyArc = (career: CareerState) => career.historyFacts.some((f) => f.id === WEEK_COMPLETED_FACT_ID || f.factType === 'academy_first_week_completed');
export const initializeAcademyArc = (career: CareerState): CareerState => {
  const next = ensureRival(ensureCoach(career));
  if (hasCompletedAcademyArc(next)) return { ...next, activeEvent: undefined };
  return next.activeEvent ? next : { ...next, activeEvent: makeEventInstance(next) };
};
