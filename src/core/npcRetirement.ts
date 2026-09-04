import type { CareerState, ProfessionalClub, WorldFootballer } from '../types/domain';
import { deriveDateOfBirth, getAgeOnDate } from './age';
import { hashRandomSeed } from './random/RandomGenerator';
import { createCareerWorldFootballerResolver, emptyWorldDelta } from './worldDatabase';

export const NPC_RETIREMENT_HARD_MAX_AGE = 43;

export interface NpcRetirementProjection {
  retires: boolean;
  retirementAge: number;
  retirementDate: string;
  probability: number;
  reason: 'projected_career_end' | 'continues';
}

/** A stable career-end fact derived once from identity and canonical characteristics. */
export const projectNpcRetirementAge = (footballer: WorldFootballer, seed: string): number => {
  const { profile, developmentProfile } = footballer;
  const goalkeeper = profile.primaryPosition === 'goalkeeper';
  const hash = hashRandomSeed(`${seed}:npc-retirement-age:${profile.id}`);
  const variation = (hash % 9) - 4;
  const character =
    (profile.attributes.professionalism - 50) / 22 + (profile.attributes.ambition - 50) / 38;
  const trajectory =
    (developmentProfile.familyDeclineStartAge[goalkeeper ? 'goalkeeper' : 'physical'] -
      (goalkeeper ? 35 : 29)) /
    2;
  const base = goalkeeper ? 38 : 35;
  return Math.max(
    29,
    Math.min(
      NPC_RETIREMENT_HARD_MAX_AGE,
      Math.round(base + variation * 0.7 + character + trajectory),
    ),
  );
};

export const projectNpcRetirement = (options: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubContext?: ProfessionalClub;
  seed: string;
}): NpcRetirementProjection => {
  const age = projectNpcRetirementAge(options.footballer, options.seed);
  const birthDate =
    options.footballer.profile.dateOfBirth ??
    deriveDateOfBirth(options.footballer.profile.age, '2026-07-01', options.footballer.profile.id);
  const retirementDate = `${Number(birthDate.slice(0, 4)) + age}${birthDate.slice(4)}`;
  const retires = options.boundaryDate >= retirementDate;
  const currentAge = getAgeOnDate(birthDate, options.boundaryDate);
  const probability = Math.max(0, Math.min(1, (currentAge - 28) / Math.max(1, age - 28)));
  return {
    retires,
    retirementAge: age,
    retirementDate,
    probability,
    reason: retires ? 'projected_career_end' : 'continues',
  };
};

/** Removes every player whose stable career end has passed; squad size never vetoes retirement. */
export const processNpcRetirements = (
  career: CareerState,
  boundaryDate: string,
  reuseOwnedDeltaMaps = false,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcRetirementProcessedThroughSeason ?? -1) >= season) return career;
  const retired = new Set(delta.retiredFootballerIds);
  const stateOverrides = reuseOwnedDeltaMaps
    ? (delta.footballerStateOverrides ?? {})
    : { ...delta.footballerStateOverrides };
  const squadOverrides = reuseOwnedDeltaMaps ? delta.squadOverrides : { ...delta.squadOverrides };
  const resolver = createCareerWorldFootballerResolver({
    ...career,
    currentDate: boundaryDate,
    worldDelta: delta,
  });
  const retire = (id: string) => {
    if (id === career.player.id || retired.has(id)) return false;
    const footballer = resolver(id);
    if (
      !footballer ||
      !projectNpcRetirement({ footballer, boundaryDate, seed: career.seed }).retires
    )
      return false;
    retired.add(id);
    // The retired-ID set is authoritative; keeping the prior contract overlay would duplicate
    // dead operational state and make long saves grow needlessly.
    delete stateOverrides[id];
    return true;
  };
  for (const club of career.clubWorld ?? []) {
    const squad = squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
    const next = squad.filter((id) => !retire(id));
    if (next.length !== squad.length) squadOverrides[club.id] = next;
  }
  for (const id of Object.keys(delta.newFootballers)) retire(id);
  for (const id of Object.keys(delta.footballerOverrides)) retire(id);
  for (const id of Object.keys(delta.footballerStateOverrides ?? {})) retire(id);
  delta = {
    ...delta,
    footballerStateOverrides: stateOverrides,
    squadOverrides,
    retiredFootballerIds: [...retired],
    npcRetirementProcessedThroughSeason: season,
  };
  return { ...career, worldDelta: delta };
};
