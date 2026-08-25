import type {
  CareerMilestone,
  CareerState,
  HistoryFact,
  MilestoneCategory,
} from '../../types/domain';

const categories: Record<string, MilestoneCategory> = {
  career_started: 'career_turning_point',
  academy_selection_result: 'role_change',
  opening_month_role_assigned: 'role_change',
  senior_debut: 'debut',
  first_senior_goal: 'goal',
  first_academy_goal: 'goal',
  first_senior_assist: 'assist',
  first_academy_assist: 'assist',
  play_style_unlocked: 'career_turning_point',
  promotion: 'role_change',
  major_relationship_changed: 'major_relationship',
  award_won: 'award',
  title_won: 'title',
  transfer_completed: 'transfer',
  record_broken: 'record',
  first_professional_contract: 'transfer',
};

export const classifyMilestone = (fact: HistoryFact): MilestoneCategory | undefined => {
  const explicit = categories[fact.factType];
  if (explicit) return explicit;
  if (fact.tags.includes('milestone') && fact.narrativeImportance >= 65)
    return 'career_turning_point';
  return undefined;
};

export const getCareerMilestones = (career: CareerState): CareerMilestone[] =>
  career.historyFacts
    .flatMap((fact) => {
      const category = classifyMilestone(fact);
      return category && fact.narrativeImportance >= 55 ? [{ fact, category }] : [];
    })
    .sort((a, b) => a.fact.date.localeCompare(b.fact.date));
