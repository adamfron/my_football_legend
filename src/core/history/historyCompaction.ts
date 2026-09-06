import type { CareerState, HistoryFact } from '../../types/domain';
import { rememberFacts } from './careerMemory';

const TECHNICAL_FACT_TYPES = new Set([
  'career_week_completed',
  'training_development_checkpoint',
  'attribute_changed',
  'regular_season_decision',
  'fixture_rescheduled',
  'match_played',
  'interactive_match',
]);

/** Folds completed-season implementation facts into memory while protecting thread references. */
export const compactCareerHistory = (career: CareerState, completedSeason: number): CareerState => {
  const protectedIds = new Set(
    career.storyThreads
      .filter((thread) => thread.status !== 'closed')
      .flatMap((thread) => thread.relatedFactIds),
  );
  const removed: HistoryFact[] = [];
  const historyFacts = career.historyFacts.filter((fact) => {
    const drop =
      fact.season <= completedSeason &&
      TECHNICAL_FACT_TYPES.has(fact.factType) &&
      !protectedIds.has(fact.id);
    if (drop) removed.push(fact);
    return !drop;
  });
  const retainedIds = new Set(historyFacts.map((fact) => fact.id));
  return {
    ...career,
    historyFacts,
    careerMemory: rememberFacts(career.careerMemory, removed),
    storyThreads: career.storyThreads.map((thread) => ({
      ...thread,
      relatedFactIds: thread.relatedFactIds.filter((id) => retainedIds.has(id)),
    })),
    completedSeasons: career.completedSeasons?.map((season) => ({
      ...season,
      milestones: season.milestones.filter((id) => retainedIds.has(id)),
    })),
  };
};
