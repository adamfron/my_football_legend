import { describe, expect, it } from 'vitest';
import { contractCoversDate, contractCoversNextSeason } from './contractValidity';
import type { CareerState, Contract } from '../types/domain';

const contract: Contract = {
  clubId: 'club',
  startDate: '2027-07-01',
  endDate: '2029-06-30',
  monthlySalary: 1,
  signingBonus: 0,
  squadRole: 'rotation',
  contractType: 'professional',
};

describe('contract date invariants', () => {
  it('treats June 30 as belonging to the previous season', () => {
    expect(contractCoversDate(contract, '2029-06-30')).toBe(true);
    expect(contractCoversDate(contract, '2029-07-01')).toBe(false);
  });
  it('requires the current deal to cover next season start', () => {
    const career = { currentSeason: 2028, currentContract: contract } as CareerState;
    expect(contractCoversNextSeason(career)).toBe(false);
    expect(contractCoversNextSeason({ ...career, currentSeason: 2027 })).toBe(true);
  });
});
