import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from '../playerCreator';
import { ACADEMY_ANCHORS, ACADEMY_EVENT_POOL, buildAcademySequence, selectCareerEventsForWeek } from './academyEventPool';
import type { CareerWeek } from '../../types/domain';

const career = (seed: string, position = 'winger') => createCareerState(generateStartingPlayerProfile({ firstName: 'Ala', lastName: 'Lis', nationality: 'PL', age: 16, dominantFoot: 'right', position: position as 'winger', heightCm: 170, weightKg: 64, seed }, seed, 0), seed);
const week: CareerWeek = { id: 'academy-week', seasonId: '2026-27', weekIndex: 2, startDate: '2026-07-08', endDate: '2026-07-14', phase: 'academy', fixtureIds: [], scheduledEventIds: [], completedEventIds: [], completed: false };

describe('academy event pool', () => {
  it('keeps anchors while seeds vary deterministically', () => {
    const one = buildAcademySequence(career('one'));
    expect(buildAcademySequence(career('one'))).toEqual(one);
    expect(buildAcademySequence(career('two'))).not.toEqual(one);
    ACADEMY_ANCHORS.forEach((anchor) => expect(one).toContain(anchor));
    expect(ACADEMY_EVENT_POOL.length).toBeGreaterThanOrEqual(12);
  });
  it('respects goalkeeper position and once-per-career facts', () => {
    const keeper = career('keeper', 'goalkeeper');
    expect(selectCareerEventsForWeek(keeper, week)).not.toContain('academy_pressure_game');
    const blocked = { ...career('once'), historyFacts: [...career('once').historyFacts, { id: 'done', factType: 'career_event_academy_technical_test', season: 2026, date: '2026-07-01', actors: [], targets: [], clubs: [], competitions: [], data: {}, causes: [], tags: [], visibility: 'hidden' as const, narrativeImportance: 1, emotionalTone: 'neutral' as const }] };
    expect(selectCareerEventsForWeek(blocked, week)).not.toContain('academy_technical_test');
  });
});
