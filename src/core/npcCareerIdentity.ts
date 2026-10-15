import type { CareerState, FootballerProfile } from '../types/domain';
import { deriveNpcPlayStyles, getNpcExperience } from './npcFootballIdentity';
import { resolveProceduralFootballer } from './proceduralFootballers';
import { getProfileAge } from './age';

/** Reuses immutable base identity even after a transfer; effective attributes are supplied once. */
export const getCareerNpcPlayStyles = (
  career: Pick<CareerState, 'footballerWorld' | 'worldDelta' | 'clubWorld' | 'historyFacts'> &
    Partial<Pick<CareerState, 'currentDate'>>,
  current: FootballerProfile,
) => {
  const base =
    career.worldDelta?.footballerOverrides[current.id] ??
    career.footballerWorld?.[current.id] ??
    resolveProceduralFootballer(current.id, career.clubWorld ?? []);
  const atDate = career.currentDate
    ? { ...current, age: getProfileAge(current, career.currentDate, '2026-07-01') }
    : current;
  return base ? deriveNpcPlayStyles(base, atDate, getNpcExperience(career).get(current.id)) : [];
};
