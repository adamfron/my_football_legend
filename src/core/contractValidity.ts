import type { CareerState, Contract } from '../types/domain';

export const getNextSeasonStartDate = (career: CareerState) => `${career.currentSeason + 1}-07-01`;

export const contractCoversDate = (contract: Contract, date: string) =>
  contract.startDate <= date && contract.endDate >= date;

export const contractCoversNextSeason = (career: CareerState) =>
  Boolean(
    career.currentContract &&
      contractCoversDate(career.currentContract, getNextSeasonStartDate(career)),
  );
