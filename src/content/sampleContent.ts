import { everymanArchetype, promisingAcademyPlayerPremise } from './archetypes/everyman';
import { sampleClub } from './clubs/sampleClub';
import { sampleMatchEvent } from './events/sampleMatchEvent';
import type { HistoryFact, Person, StoryThread } from '../types/domain';

export const samplePerson: Person = { id: 'person_marek_wrona', firstName: 'Marek', lastName: 'Wrona', role: 'coach', nationality: 'Polska', age: 46, personality: ['wymagający','lojalny'], clubId: sampleClub.id, persistence: 'career', relationshipParameters: { liking: 50, trust: 45, respect: 58, rivalry: 5, resentment: 8, gratitude: 12, professionalDependence: 40 }, faceSeed: 'marek-wrona-2026', narrativeTags: ['mentor_candidate'] };
export const sampleHistoryFact: HistoryFact = { id: 'fact_first_senior_bench', factType: 'squad_selection', season: 2026, date: '2026-08-01', actors: ['player_sample'], targets: [], clubs: [sampleClub.id], competitions: ['Liga fikcyjna'], data: { bench: true }, causes: [], tags: ['debut_path'], visibility: 'public', narrativeImportance: 35, emotionalTone: 'positive' };
export const sampleStoryThread: StoryThread = { id: 'thread_coach_trust', threadType: 'relationship', participants: ['player_sample', samplePerson.id], relatedFactIds: [sampleHistoryFact.id], status: 'open', tension: 22, importance: 50, openedSeason: 2026, lastActivitySeason: 2026, recallTags: ['coach_trust','academy_path'] };
export const sampleContent = { archetypes: [everymanArchetype], careerPremises: [promisingAcademyPlayerPremise], clubs: [sampleClub], people: [samplePerson], events: [sampleMatchEvent], historyFacts: [sampleHistoryFact], storyThreads: [sampleStoryThread] };
