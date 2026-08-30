import { describe, expect, it } from 'vitest';
import type { CareerState } from '../types/domain';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { applyMonthlySalary } from './careerWeeks';

const career = (): CareerState => {
  const profile = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Testowy',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      difficulty: 'normal',
      position: 'striker',
      heightCm: 183,
      weightKg: 78,
      seed: 'salary',
    },
    'salary',
    'poacher',
  );
  return {
    ...createCareerState(profile, 'salary'),
    currentContract: {
      clubId: 'club',
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      monthlySalary: 3000,
      signingBonus: 0,
      squadRole: 'rotation',
      contractType: 'professional',
    },
  };
};

describe('monthly contract salary', () => {
  it('posts twelve equal payments to the canonical balance', () => {
    let state = career();
    for (let i = 0; i < 12; i++)
      state = applyMonthlySalary(
        state,
        `${i < 6 ? '2026' : '2027'}-${String(((i + 6) % 12) + 1).padStart(2, '0')}`,
      );
    const salary = state.finances!.filter((t) => t.category === 'salary');
    expect(salary).toHaveLength(12);
    expect(salary.every((t) => t.amount === 3000)).toBe(true);
    expect(state.finances!.reduce((sum, t) => sum + t.amount, 0)).toBe(36000);
  });
  it('is idempotent and does not pay outside the contract', () => {
    const paid = applyMonthlySalary(career(), '2026-07');
    expect(applyMonthlySalary(paid, '2026-07').finances).toHaveLength(1);
    expect(applyMonthlySalary(paid, '2027-07').finances).toHaveLength(1);
  });
  it('does not pay an academy player without a professional contract', () => {
    const state = career();
    delete state.currentContract;
    expect(applyMonthlySalary(state, '2026-07').finances).toBeUndefined();
  });
});
