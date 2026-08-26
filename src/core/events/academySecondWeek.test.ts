import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from '../playerCreator';
import { advanceActiveEvent, applyEventResolution } from './applyEventResolution';
import { initializeAcademyArc, initializeSecondAcademyWeek } from './academyArc';
import { getEventDefinition } from './eventRegistry';
import { resolveEventChoice } from './resolveEventChoice';

const input: CreatorInput = {
  firstName: 'Jan',
  lastName: 'Testowy',
  nationality: 'PL',
  age: 16,
  dominantFoot: 'right',
  position: 'winger',
  heightCm: 174,
  weightKg: 68,
  seed: 'onboarding',
};
const start = (seed: string) =>
  initializeAcademyArc(
    createCareerState(generateStartingPlayerProfile({ ...input, seed }, seed, 0), seed),
  );
const chooseFirst = (career: ReturnType<typeof start>) => {
  const choice = getEventDefinition(career.activeEvent!.definitionId).decisions[0]!;
  return applyEventResolution(career, resolveEventChoice(career, choice));
};
const finish = (seed: string) => {
  let career = start(seed);
  let decisions = 0;
  while (career.activeEvent) {
    career = chooseFirst(career);
    decisions++;
    career = advanceActiveEvent(career);
  }
  return { career, decisions };
};

describe('canonical academy onboarding', () => {
  it('finishes in two or three decisions and assigns only a U-17 role', () => {
    for (let index = 0; index < 20; index++) {
      const { career, decisions } = finish(`onboarding-${index}`);
      expect(decisions).toBeGreaterThanOrEqual(2);
      expect(decisions).toBeLessThanOrEqual(3);
      expect(
        career.historyFacts.find((fact) => fact.factType === 'opening_month_role_assigned')?.data,
      ).toMatchObject({ teamLevel: 'academy' });
      expect(
        career.historyFacts.some((fact) => fact.factType === 'post_selection_path_completed'),
      ).toBe(true);
      expect(initializeSecondAcademyWeek(career).activeEvent).toBeUndefined();
    }
  });

  it('records a canonical ambition profile and evaluates it against current ability', () => {
    const career = chooseFirst(start('ambition-profile'));
    const fact = career.historyFacts.find((item) => item.factType === 'academy_first_impression');
    expect(['bold', 'balanced', 'patient']).toContain(fact?.data.ambitionProfile);
    expect(['aspirational', 'realistic', 'understated']).toContain(fact?.data.ambitionAssessment);
  });
});
