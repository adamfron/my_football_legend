import type { CareerState } from '../../types/domain';
import { saveCareer } from '../persistence';
import { COACH_ID, RIVAL_ID, WEEK_COMPLETED_FACT_ID, clamp, makeEventInstance, mergeRelationship, upsertThread } from './academyArc';
import type { EventResolution } from './resolveEventChoice';
const addFact = (career: CareerState, fact: CareerState['historyFacts'][number]) => career.historyFacts.some((f) => f.id === fact.id) ? career : { ...career, historyFacts: [...career.historyFacts, fact] };
const relationThreadType = (r: CareerState['relationships'][string]) => r.resentment > 55 ? 'resentment' : r.rivalry > 55 && r.trust < 58 ? 'rivalry' : r.trust + r.gratitude > r.rivalry + r.resentment + 35 ? 'friendship' : 'uneasy_alliance';
export const completeAcademyWeek = (career: CareerState): CareerState => {
  if (career.historyFacts.some(f=>f.id===WEEK_COMPLETED_FACT_ID)) return { ...career, activeEvent: undefined };
  const causes = career.historyFacts.filter(f=>f.tags.includes('academy_first_week')).map(f=>f.id);
  return addFact({ ...career, activeEvent: undefined }, { id: WEEK_COMPLETED_FACT_ID, factType: 'academy_first_week_completed', season: career.currentSeason, date: '2026-07-07', actors: [career.player.id], targets: [COACH_ID,RIVAL_ID], clubs: [career.currentClub.id], competitions: [], data: { summary: true }, causes, tags: ['academy_first_week'], visibility: 'partial', narrativeImportance: 75, emotionalTone: 'bittersweet' });
};
export const applyEventResolution = (career: CareerState, resolution: EventResolution): CareerState => {
  if (!career.activeEvent || career.activeEvent.result) return career;
  const selectedDecisionId = String(resolution.fact.data.decisionId);
  let next: CareerState = { ...career, player: { ...career.player, morale: clamp(career.player.morale + resolution.moraleDelta), fitness: clamp(career.player.fitness + resolution.fitnessDelta), reputation: clamp(career.player.reputation + resolution.reputationDelta) }, relationships: { ...career.relationships }, activeEvent: { ...career.activeEvent, selectedDecisionId, result: { tier: resolution.tier, objectiveOutcome: resolution.objectiveOutcome, interpretations: resolution.interpretations }, createdFactIds: [resolution.fact.id] } };
  for (const [id, delta] of Object.entries(resolution.relationshipChanges)) next.relationships[id] = mergeRelationship(next.relationships[id]!, delta);
  next = addFact(next, resolution.fact);
  if (career.activeEvent.definitionId === 'academy_coach_introduction') next = upsertThread(next, { id: 'coach_trust_thread', threadType: 'coach_trust', participants: [career.player.id, COACH_ID], relatedFactIds: [resolution.fact.id], status: 'open', tension: 20, importance: 60, openedSeason: career.currentSeason, lastActivitySeason: career.currentSeason, recallTags: ['academy_first_week','coach_first_impression'] });
  if (['academy_rival_reaction', 'academy_rival_extra_session', 'academy_selection_announcement', 'academy_selection_response'].includes(career.activeEvent.definitionId)) { const type = career.historyFacts.some(f=>f.factType==='academy_selection_result' && f.data.selectionOutcome==='both_invited') ? 'shared_opportunity' : relationThreadType(next.relationships[RIVAL_ID]!); next = upsertThread(next, { id: 'academy_rival_thread', threadType: type, participants: [career.player.id, RIVAL_ID], relatedFactIds: [resolution.fact.id], status: 'open', tension: type === 'friendship' || type === 'shared_opportunity' ? 25 : 65, importance: 65, openedSeason: career.currentSeason, lastActivitySeason: career.currentSeason, recallTags: ['academy_first_week','first_scrimmage','first_rival','final_assessment','senior_trial_decision'] }); }
  if (['academy_week_two_feedback', 'academy_final_assessment', 'academy_selection_announcement', 'academy_selection_response'].includes(career.activeEvent.definitionId)) next = upsertThread(next, { id: 'coach_trust_thread', threadType: 'coach_trust', participants: [career.player.id, COACH_ID], relatedFactIds: [resolution.fact.id], status: 'open', tension: next.relationships[COACH_ID]!.trust > 60 ? 25 : 55, importance: 75, openedSeason: career.currentSeason, lastActivitySeason: career.currentSeason, recallTags: ['academy_first_week','coach_first_impression','academy_feedback','final_assessment','senior_trial_decision','coach_selection_response'] });
  saveCareer(next); return next;
};
export const advanceActiveEvent = (career: CareerState): CareerState => {
  if (!career.activeEvent?.result) return career;
  const nextId = career.activeEvent.result.objectiveOutcome === 'academy_second_week_completed' ? undefined : career.activeEvent.definitionId === 'academy_coach_introduction' ? 'academy_first_scrimmage' : career.activeEvent.definitionId === 'academy_first_scrimmage' ? 'academy_rival_reaction' : career.activeEvent.definitionId === 'academy_week_two_feedback' ? 'academy_rival_extra_session' : career.activeEvent.definitionId === 'academy_rival_extra_session' ? 'academy_final_assessment' : career.activeEvent.definitionId === 'academy_final_assessment' ? 'academy_selection_announcement' : career.activeEvent.definitionId === 'academy_selection_announcement' ? 'academy_selection_response' : career.activeEvent.definitionId === 'academy_selection_response' ? 'academy_second_week_summary' : undefined;
  const next = nextId ? { ...career, activeEvent: makeEventInstance(career, nextId) } : career.activeEvent.definitionId === 'academy_rival_reaction' ? completeAcademyWeek(career) : { ...career, activeEvent: undefined };
  saveCareer(next); return next;
};
