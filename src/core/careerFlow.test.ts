import { describe, expect, it } from 'vitest';
import { advanceAugustWeek, initializeAugustPhase, resolveAugustActivity } from './augustPlanning';
import { advanceCareerFlow } from './careerFlow';
import {
  hasCompletedAcademyArc,
  initializeSecondAcademyWeek,
  makeEventInstance,
} from './events/academyArc';
import {
  advanceActiveEvent,
  applyEventResolution,
  completeAcademyWeek,
} from './events/applyEventResolution';
import { getAvailableDecisions } from './events/decisionAvailability';
import { getEventDefinition } from './events/eventRegistry';
import { resolveEventChoice } from './events/resolveEventChoice';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import type { CareerState, HistoryFact } from '../types/domain';

const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Testowy',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  customSeed: '',
  position: 'winger',
  heightCm: 174,
  weightKg: 68,
  seed: 'career-flow',
};
const fresh = () =>
  createCareerState(generateStartingPlayerProfile(input, input.seed, 0), input.seed);
const addFact = (career: CareerState, factType: string, data: Record<string, unknown> = {}) => {
  const template = career.historyFacts[0]!;
  const fact: HistoryFact = {
    ...template,
    id: `fact_test_${factType}`,
    factType,
    data,
  };
  return { ...career, historyFacts: [...career.historyFacts, fact] };
};
const firstWeekComplete = () => addFact(fresh(), 'academy_first_week_completed');
const selectionComplete = () =>
  addFact(
    addFact(firstWeekComplete(), 'academy_second_week_completed'),
    'academy_selection_result',
    { selectionOutcome: 'player_invited' },
  );
const postComplete = () =>
  addFact(
    addFact(selectionComplete(), 'opening_month_role_assigned', {
      role: 'weekly_senior_access',
    }),
    'post_selection_path_completed',
  );

describe('career flow router', () => {
  const cases: Array<[string, () => CareerState, string | undefined]> = [
    ['fresh career', fresh, 'academy_coach_introduction'],
    [
      'active first week',
      () => ({ ...fresh(), activeEvent: makeEventInstance(fresh()) }),
      'academy_coach_introduction',
    ],
    ['completed first week', firstWeekComplete, undefined],
    [
      'active second week',
      () => ({
        ...firstWeekComplete(),
        activeEvent: makeEventInstance(firstWeekComplete(), 'academy_week_two_feedback'),
      }),
      'academy_week_two_feedback',
    ],
    [
      'selection result without post-selection event',
      selectionComplete,
      'senior_dressing_room_arrival',
    ],
    [
      'active post-selection',
      () => ({
        ...selectionComplete(),
        activeEvent: makeEventInstance(selectionComplete(), 'senior_first_training'),
      }),
      'senior_first_training',
    ],
    ['completed post-selection', postComplete, undefined],
    ['active August', () => initializeAugustPhase(postComplete()), undefined],
    [
      'completed August',
      () => {
        let career = initializeAugustPhase(postComplete());
        for (let week = 0; week < 4; week += 1) {
          career = resolveAugustActivity(career, 'prioritize_recovery');
          career = advanceAugustWeek(career);
        }
        return career;
      },
      undefined,
    ],
  ];

  for (const [name, makeCareer, expectedEvent] of cases)
    it(`routes ${name} idempotently`, () => {
      const once = advanceCareerFlow(makeCareer());
      const twice = advanceCareerFlow(once);
      expect(once.activeEvent?.definitionId).toBe(expectedEvent);
      expect(twice).toEqual(once);
      expect(new Set(twice.historyFacts.map((fact) => fact.id)).size).toBe(
        twice.historyFacts.length,
      );
      expect(new Set(twice.significantPeople.map((person) => person.id)).size).toBe(
        twice.significantPeople.length,
      );
    });
});

describe('career progression regression', () => {
  it('plays every existing phase without reload and never returns to the first-week fallback', () => {
    let career = advanceCareerFlow(fresh());
    let selectionSeen = false;

    const normalize = (next: CareerState) => {
      career = advanceCareerFlow(next);
      if (career.historyFacts.some((fact) => fact.factType === 'academy_selection_result')) {
        selectionSeen = true;
        expect(
          career.activeEvent ||
            career.historyFacts.some((fact) => fact.factType === 'post_selection_path_completed') ||
            career.augustPlanning,
        ).toBeTruthy();
        expect(
          !career.activeEvent &&
            hasCompletedAcademyArc(career) &&
            !career.historyFacts.some((fact) => fact.factType === 'academy_selection_result'),
        ).toBe(false);
      }
    };
    const playActiveEvent = () => {
      const event = career.activeEvent!;
      if (event.definitionId === 'academy_first_week_summary') {
        normalize(completeAcademyWeek(career));
        return;
      }
      const definition = getEventDefinition(event.definitionId);
      const decision = getAvailableDecisions(career, event, definition.decisions)[0]!;
      normalize(applyEventResolution(career, resolveEventChoice(career, decision)));
      normalize(advanceActiveEvent(career));
    };

    while (career.activeEvent) playActiveEvent();
    expect(hasCompletedAcademyArc(career)).toBe(true);
    normalize(initializeSecondAcademyWeek(career));
    while (career.activeEvent) playActiveEvent();

    expect(selectionSeen).toBe(true);
    expect(
      career.historyFacts.some((fact) => fact.factType === 'post_selection_path_completed'),
    ).toBe(true);
    normalize(initializeAugustPhase(career));
    expect(career.augustPlanning?.currentWeek).toBe(1);
  });
});
