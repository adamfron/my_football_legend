import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from './playerCreator';
import { advanceActiveEvent, applyEventResolution } from './events/applyEventResolution';
import { getAvailableDecisions, isDecisionAvailable } from './events/decisionAvailability';
import { initializeAcademyArc } from './events/academyArc';
import { getEventDefinition } from './events/eventRegistry';
import { resolveEventChoice } from './events/resolveEventChoice';
import {
  advanceAugustWeek,
  augustActivities,
  canChooseAugustActivity,
  getAvailableFunds,
  initializeAugustPhase,
  resolveAugustActivity,
} from './augustPlanning';

const makeCareer = (
  position: CreatorInput['position'] = 'defensive_midfielder',
  seed = 'august-test',
) => {
  const input: CreatorInput = {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'PL',
    age: 16,
    dominantFoot: 'right',
    customSeed: '',
    position,
    heightCm: 180,
    weightKg: 74,
    seed,
  };
  return createCareerState(generateStartingPlayerProfile(input, seed, 0), seed);
};
const ready = (seed = 'august-test') => {
  const career = makeCareer('defensive_midfielder', seed);
  const base = career.historyFacts[0]!;
  return {
    ...career,
    historyFacts: [
      ...career.historyFacts,
      {
        ...base,
        id: 'role',
        factType: 'opening_month_role_assigned',
        data: { role: 'weekly_senior_access' },
      },
      { ...base, id: 'post', factType: 'post_selection_path_completed', data: {} },
    ],
  };
};

describe('decision availability', () => {
  it('separates goalkeeper and outfield choices outside React and rejects forbidden resolution', () => {
    let outfield = initializeAcademyArc(makeCareer());
    outfield = advanceActiveEvent(
      applyEventResolution(
        outfield,
        resolveEventChoice(
          outfield,
          getEventDefinition('academy_coach_introduction').decisions[0]!,
        ),
      ),
    );
    const definition = getEventDefinition('academy_first_scrimmage');
    expect(
      getAvailableDecisions(outfield, outfield.activeEvent!, definition.decisions).map((d) => d.id),
    ).not.toContain('gk_safe');
    const forbidden = definition.decisions.find((d) => d.id === 'gk_long_counter')!;
    expect(isDecisionAvailable(outfield, outfield.activeEvent!, forbidden)).toBe(false);
    expect(() => resolveEventChoice(outfield, forbidden)).toThrow('not available');
    let keeper = initializeAcademyArc(makeCareer('goalkeeper'));
    keeper = advanceActiveEvent(
      applyEventResolution(
        keeper,
        resolveEventChoice(keeper, getEventDefinition('academy_coach_introduction').decisions[0]!),
      ),
    );
    const ids = getAvailableDecisions(keeper, keeper.activeEvent!, definition.decisions).map(
      (d) => d.id,
    );
    expect(ids).toContain('gk_safe');
    expect(ids).not.toContain('take_action');
  });
});

describe('August weekly planning', () => {
  it('requires both completion facts and initializes only once with a ledger stipend', () => {
    expect(initializeAugustPhase(makeCareer())).toEqual(makeCareer());
    const first = initializeAugustPhase(ready());
    const second = initializeAugustPhase(first);
    expect(first.augustPlanning?.currentWeek).toBe(1);
    expect(getAvailableFunds(first)).toBe(800);
    expect(second).toEqual(first);
  });
  it('offers all activities, blocks unaffordable choices and gives deterministic delivery income', () => {
    expect(augustActivities).toHaveLength(6);
    const poor = { ...initializeAugustPhase(ready()), finances: [] };
    expect(canChooseAugustActivity(poor, 'hire_personal_coach')).toBe(false);
    expect(resolveAugustActivity(poor, 'hire_personal_coach')).toEqual(poor);
    const a = resolveAugustActivity(initializeAugustPhase(ready('same')), 'food_delivery_shift');
    const b = resolveAugustActivity(initializeAugustPhase(ready('same')), 'food_delivery_shift');
    expect(a.finances).toEqual(b.finances);
    expect(getAvailableFunds(a)).toBeGreaterThanOrEqual(950);
    expect(getAvailableFunds(a)).toBeLessThanOrEqual(1050);
  });
  it('plays four reusable weeks, persists facts, recovery and a bounded monthly gain', () => {
    let career = initializeAugustPhase(ready('four-weeks'));
    const initialFitness = career.player.fitness;
    const initialAttributes = { ...career.player.attributes };
    for (let week = 1; week <= 4; week++) {
      career = resolveAugustActivity(career, 'prioritize_recovery');
      expect(
        career.historyFacts.filter((f) => f.factType === 'weekly_personal_activity'),
      ).toHaveLength(week);
      career = advanceAugustWeek(career);
    }
    expect(career.player.fitness).toBeGreaterThan(initialFitness);
    expect(career.augustPlanning?.completed).toBe(true);
    expect(career.historyFacts.some((f) => f.factType === 'august_2026_completed')).toBe(true);
    expect(
      Object.keys(initialAttributes).reduce(
        (sum, key) =>
          sum +
          Math.max(
            0,
            career.player.attributes[key as keyof typeof initialAttributes] -
              initialAttributes[key as keyof typeof initialAttributes],
          ),
        0,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
