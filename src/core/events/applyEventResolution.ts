import type { CareerState } from '../../types/domain';
import {
  COACH_ID,
  RIVAL_ID,
  WEEK_COMPLETED_FACT_ID,
  clamp,
  makeEventInstance,
  mergeRelationship,
  upsertThread,
} from './academyArc';
import type { EventResolution } from './resolveEventChoice';
import { makePathFact, POST_PATH_COMPLETED } from './postSelectionPath';
import { nextPostSelectionEvent } from './resolvers/postSelectionResolvers';
import { RandomGenerator } from '../random/RandomGenerator';
const addFact = (career: CareerState, fact: CareerState['historyFacts'][number]) =>
  career.historyFacts.some((f) => f.id === fact.id)
    ? career
    : { ...career, historyFacts: [...career.historyFacts, fact] };
const relationThreadType = (r: CareerState['relationships'][string]) =>
  r.resentment > 55
    ? 'resentment'
    : r.rivalry > 55 && r.trust < 58
      ? 'rivalry'
      : r.trust + r.gratitude > r.rivalry + r.resentment + 35
        ? 'friendship'
        : 'uneasy_alliance';
export const completeAcademyWeek = (career: CareerState): CareerState => {
  if (career.historyFacts.some((f) => f.id === WEEK_COMPLETED_FACT_ID))
    return { ...career, activeEvent: undefined };
  const causes = career.historyFacts
    .filter((f) => f.tags.includes('academy_first_week'))
    .map((f) => f.id);
  let completed = addFact(
    { ...career, activeEvent: undefined },
    {
      id: WEEK_COMPLETED_FACT_ID,
      factType: 'academy_first_week_completed',
      season: career.currentSeason,
      date: '2026-07-07',
      actors: [career.player.id],
      targets: [COACH_ID, RIVAL_ID],
      clubs: [career.currentClub.id],
      competitions: [],
      data: { summary: true },
      causes,
      tags: ['academy_first_week'],
      visibility: 'partial',
      narrativeImportance: 75,
      emotionalTone: 'bittersweet',
    },
  );
  // New careers stay in one U-17 squad. These facts replace the obsolete senior-trial path,
  // while old saves which already contain their detailed selection history remain untouched.
  if (!completed.historyFacts.some((fact) => fact.factType === 'academy_selection_result'))
    completed = addFact(completed, {
      id: 'fact_academy_u17_role_confirmed',
      factType: 'academy_selection_result',
      season: completed.currentSeason,
      date: '2026-07-07',
      actors: [completed.player.id],
      targets: [COACH_ID],
      clubs: [completed.currentClub.id],
      competitions: ['Polska Liga U-17'],
      data: { selectionOutcome: 'academy_u17_player', teamLevel: 'academy' },
      causes,
      tags: ['academy_onboarding', 'u17_role'],
      visibility: 'partial',
      narrativeImportance: 80,
      emotionalTone: 'positive',
    });
  if (!completed.historyFacts.some((fact) => fact.factType === POST_PATH_COMPLETED))
    completed = addFact(completed, {
      id: 'fact_academy_onboarding_completed',
      factType: POST_PATH_COMPLETED,
      season: completed.currentSeason,
      date: '2026-07-07',
      actors: [completed.player.id],
      targets: [COACH_ID],
      clubs: [completed.currentClub.id],
      competitions: ['Polska Liga U-17'],
      data: { role: 'academy_player', teamLevel: 'academy' },
      causes: completed.historyFacts.slice(-2).map((fact) => fact.id),
      tags: ['academy_onboarding', POST_PATH_COMPLETED],
      visibility: 'partial',
      narrativeImportance: 75,
      emotionalTone: 'positive',
    });
  if (!completed.historyFacts.some((fact) => fact.factType === 'opening_month_role_assigned'))
    completed = addFact(completed, {
      id: 'fact_academy_u17_squad_role',
      factType: 'opening_month_role_assigned',
      season: completed.currentSeason,
      date: '2026-07-07',
      actors: [completed.player.id],
      targets: [COACH_ID],
      clubs: [completed.currentClub.id],
      competitions: ['Polska Liga U-17'],
      data: { role: 'academy_leader', teamLevel: 'academy' },
      causes: completed.historyFacts.slice(-2).map((fact) => fact.id),
      tags: ['academy_onboarding', 'u17_role'],
      visibility: 'partial',
      narrativeImportance: 70,
      emotionalTone: 'positive',
    });
  return completed;
};
export const applyEventResolution = (
  career: CareerState,
  resolution: EventResolution,
): CareerState => {
  if (!career.activeEvent || career.activeEvent.result) return career;
  const selectedDecisionId = String(resolution.fact.data.decisionId);
  let next: CareerState = {
    ...career,
    player: {
      ...career.player,
      morale: clamp(career.player.morale + resolution.moraleDelta),
      fitness: clamp(career.player.fitness + resolution.fitnessDelta),
      reputation: clamp(career.player.reputation + resolution.reputationDelta),
    },
    relationships: { ...career.relationships },
    activeEvent: {
      ...career.activeEvent,
      selectedDecisionId,
      result: {
        tier: resolution.tier,
        objectiveOutcome: resolution.objectiveOutcome,
        interpretations: resolution.interpretations,
      },
      createdFactIds: [resolution.fact.id],
    },
  };
  for (const [id, delta] of Object.entries(resolution.relationshipChanges))
    next.relationships[id] = mergeRelationship(next.relationships[id]!, delta);
  next = addFact(next, resolution.fact);
  if (resolution.fact.factType === 'opening_month_role_assigned')
    next = addFact(
      next,
      makePathFact(
        next,
        POST_PATH_COMPLETED,
        { eventId: career.activeEvent.definitionId, roleFactId: resolution.fact.id },
        95,
      ),
    );
  if (career.activeEvent.definitionId === 'academy_coach_introduction')
    next = upsertThread(next, {
      id: 'coach_trust_thread',
      threadType: 'coach_trust',
      participants: [career.player.id, COACH_ID],
      relatedFactIds: [resolution.fact.id],
      status: 'open',
      tension: 20,
      importance: 60,
      openedSeason: career.currentSeason,
      lastActivitySeason: career.currentSeason,
      recallTags: ['academy_first_week', 'coach_first_impression'],
    });
  if (
    [
      'academy_rival_reaction',
      'academy_rival_extra_session',
      'academy_selection_announcement',
      'academy_selection_response',
    ].includes(career.activeEvent.definitionId)
  ) {
    const type = career.historyFacts.some(
      (f) =>
        f.factType === 'academy_selection_result' && f.data.selectionOutcome === 'both_invited',
    )
      ? 'shared_opportunity'
      : relationThreadType(next.relationships[RIVAL_ID]!);
    next = upsertThread(next, {
      id: 'academy_rival_thread',
      threadType: type,
      participants: [career.player.id, RIVAL_ID],
      relatedFactIds: [resolution.fact.id],
      status: 'open',
      tension: type === 'friendship' || type === 'shared_opportunity' ? 25 : 65,
      importance: 65,
      openedSeason: career.currentSeason,
      lastActivitySeason: career.currentSeason,
      recallTags: [
        'academy_first_week',
        'first_scrimmage',
        'first_rival',
        'final_assessment',
        'senior_trial_decision',
      ],
    });
  }
  if (
    [
      'academy_week_two_feedback',
      'academy_final_assessment',
      'academy_selection_announcement',
      'academy_selection_response',
    ].includes(career.activeEvent.definitionId)
  )
    next = upsertThread(next, {
      id: 'coach_trust_thread',
      threadType: 'coach_trust',
      participants: [career.player.id, COACH_ID],
      relatedFactIds: [resolution.fact.id],
      status: 'open',
      tension: next.relationships[COACH_ID]!.trust > 60 ? 25 : 55,
      importance: 75,
      openedSeason: career.currentSeason,
      lastActivitySeason: career.currentSeason,
      recallTags: [
        'academy_first_week',
        'coach_first_impression',
        'academy_feedback',
        'final_assessment',
        'senior_trial_decision',
        'coach_selection_response',
      ],
    });
  return next;
};
export const advanceActiveEvent = (career: CareerState): CareerState => {
  if (!career.activeEvent?.result) return career;
  const postNextId = ['senior_', 'development_', 'rival_promoted_', 'academy_extra_'].some(
    (prefix) => career.activeEvent!.definitionId.startsWith(prefix),
  )
    ? nextPostSelectionEvent(career, career.activeEvent.definitionId)
    : undefined;
  const nextId =
    postNextId ??
    (career.activeEvent.result.objectiveOutcome === 'academy_second_week_completed'
      ? undefined
      : career.activeEvent.definitionId === 'academy_coach_introduction'
        ? 'academy_first_scrimmage'
        : career.activeEvent.definitionId === 'academy_first_scrimmage'
          ? RandomGenerator.fromSeed(`${career.seed}:academy-onboarding`).bool(0.5)
            ? 'academy_rival_reaction'
            : undefined
          : career.activeEvent.definitionId === 'academy_week_two_feedback'
            ? 'academy_rival_extra_session'
            : career.activeEvent.definitionId === 'academy_rival_extra_session'
              ? 'academy_final_assessment'
              : career.activeEvent.definitionId === 'academy_final_assessment'
                ? 'academy_selection_announcement'
                : career.activeEvent.definitionId === 'academy_selection_announcement'
                  ? 'academy_selection_response'
                  : career.activeEvent.definitionId === 'academy_selection_response'
                    ? 'academy_second_week_summary'
                    : undefined);
  const next = nextId
    ? { ...career, activeEvent: makeEventInstance(career, nextId) }
    : ['academy_first_scrimmage', 'academy_rival_reaction'].includes(
          career.activeEvent.definitionId,
        )
      ? completeAcademyWeek(career)
      : { ...career, activeEvent: undefined };
  return next;
};
