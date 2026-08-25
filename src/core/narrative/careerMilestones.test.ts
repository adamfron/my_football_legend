import { describe, expect, it } from 'vitest';
import { classifyMilestone } from './careerMilestones';
import type { HistoryFact } from '../../types/domain';
const fact = (factType: string, importance = 70): HistoryFact => ({ id: factType, factType, season: 2026, date: '2026-01-01', actors: [], targets: [], clubs: [], competitions: [], data: {}, causes: [], tags: [], visibility: 'public', narrativeImportance: importance, emotionalTone: 'neutral' });
describe('career milestones', () => {
  it('classifies debuts, first contributions and play styles', () => {
    expect(classifyMilestone(fact('senior_debut'))).toBe('debut');
    expect(classifyMilestone(fact('first_senior_goal'))).toBe('goal');
    expect(classifyMilestone(fact('first_senior_assist'))).toBe('assist');
    expect(classifyMilestone(fact('play_style_unlocked'))).toBe('career_turning_point');
  });
  it('does not promote routine facts', () => {
    expect(classifyMilestone(fact('match_played'))).toBeUndefined();
    expect(classifyMilestone(fact('weekly_personal_activity'))).toBeUndefined();
  });
});
