import { describe, expect, it } from 'vitest';
import {
  createCareerState,
  generateStartingPlayerProfile,
  type CreatorInput,
} from '../playerCreator';
import {
  initializePostSelectionPath,
  SENIOR_CAPTAIN_ID,
  SENIOR_COACH_ID,
} from './postSelectionPath';
const make = (outcome: string) => {
  const seed = `path-${outcome}`;
  const input: CreatorInput = {
    firstName: 'Jan',
    lastName: 'Test',
    nationality: 'PL',
    age: 16,
    dominantFoot: 'right',
    customSeed: '',
    position: 'goalkeeper',
    heightCm: 190,
    weightKg: 82,
    seed,
  };
  const c = createCareerState(generateStartingPlayerProfile(input, seed, 0), seed);
  return {
    ...c,
    historyFacts: [
      ...c.historyFacts,
      {
        ...c.historyFacts[0]!,
        id: 'selection',
        factType: 'academy_selection_result',
        data: { selectionOutcome: outcome },
      },
    ],
  };
};
describe('post selection router', () => {
  for (const outcome of [
    'player_invited',
    'both_invited',
    'rival_invited_player_plan',
    'extended_assessment',
  ])
    it(`routes ${outcome}`, () =>
      expect(initializePostSelectionPath(make(outcome)).activeEvent).toBeTruthy());
  it('creates deterministic senior people only after contact', () => {
    const a = initializePostSelectionPath(make('player_invited'));
    const b = initializePostSelectionPath(make('player_invited'));
    expect(a.significantPeople.find((p) => p.id === SENIOR_CAPTAIN_ID)).toEqual(
      b.significantPeople.find((p) => p.id === SENIOR_CAPTAIN_ID),
    );
    expect(a.significantPeople.some((p) => p.id === SENIOR_COACH_ID)).toBe(true);
    expect(
      initializePostSelectionPath(make('extended_assessment')).significantPeople.some(
        (p) => p.id === SENIOR_COACH_ID,
      ),
    ).toBe(false);
  });
});
