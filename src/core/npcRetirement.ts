import type { CareerState, ProfessionalClub, WorldFootballer } from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta, resolveCareerWorldFootballer } from './worldDatabase';

export interface NpcRetirementProjection {
  retires: boolean;
  probability: number;
  reason: 'age_and_career_context' | 'continues';
}

const deriveBoundaryAge = (footballer: WorldFootballer, boundaryDate: string) => {
  const dateOfBirth = footballer.profile.dateOfBirth;
  if (!dateOfBirth) return getProfileAge(footballer.profile, boundaryDate, '2026-07-01');
  const boundaryYear = Number(boundaryDate.slice(0, 4));
  const birthYear =
    (dateOfBirth.charCodeAt(0) - 48) * 1000 +
    (dateOfBirth.charCodeAt(1) - 48) * 100 +
    (dateOfBirth.charCodeAt(2) - 48) * 10 +
    dateOfBirth.charCodeAt(3) -
    48;
  const boundaryMonthDay = boundaryDate.slice(5);
  return boundaryYear - birthYear - (boundaryMonthDay < dateOfBirth.slice(5) ? 1 : 0);
};

const projectNpcRetirementAtAge = (
  footballer: WorldFootballer,
  boundaryDate: string,
  seed: string,
  age: number,
): NpcRetirementProjection => {
  const goalkeeper = footballer.profile.primaryPosition === 'goalkeeper';
  const start = goalkeeper ? 34 : 30;
  const years = age - start;
  if (years < 0) return { retires: false, probability: 0, reason: 'continues' };
  const base = goalkeeper ? 0.025 + years * 0.075 : 0.025 + years * 0.105;
  const attributes = footballer.profile.attributes;
  const characterExtension =
    (attributes.professionalism - 50 + (attributes.ambition - 50) * 0.55) / 500;
  const abilityExtension =
    (getPlayerOverall(footballer.profile, footballer.profile.primaryPosition) - 55) / 450;
  const unattachedPressure = footballer.currentClubId ? 0 : 0.08;
  const probability = Math.max(
    0.005,
    Math.min(0.92, base - characterExtension - abilityExtension + unattachedPressure),
  );
  const retires = RandomGenerator.fromSeed(
    `${seed}:npc-retirement:${boundaryDate}:${footballer.profile.id}`,
  ).bool(probability);
  return { retires, probability, reason: retires ? 'age_and_career_context' : 'continues' };
};

/** Pure retirement decision; optional context is intentionally extensible for later match signals. */
export const projectNpcRetirement = (options: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubContext?: ProfessionalClub;
  seed: string;
}): NpcRetirementProjection => {
  const { footballer, boundaryDate, seed } = options;
  return projectNpcRetirementAtAge(
    footballer,
    boundaryDate,
    seed,
    deriveBoundaryAge(footballer, boundaryDate),
  );
};

/**
 * Removes retirees sparsely. The 18-player floor is a temporary bridge until NPC transfers
 * provide ordinary replacements; it deliberately does not optimize or regenerate senior squads.
 */
export const processNpcRetirements = (
  career: CareerState,
  boundaryDate: string,
  reuseOwnedDeltaMaps = false,
): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcRetirementProcessedThroughSeason ?? -1) >= season) return career;
  const clubs = career.clubWorld ?? [];
  const retired = new Set(delta.retiredFootballerIds);
  const overrides = reuseOwnedDeltaMaps
    ? delta.footballerOverrides
    : { ...delta.footballerOverrides };
  const squadOverrides = reuseOwnedDeltaMaps ? delta.squadOverrides : { ...delta.squadOverrides };
  for (const club of clubs) {
    const squad = squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
    const active = squad.filter((id) => id === career.player.id || !retired.has(id));
    const selected: string[] = [];
    for (const id of active) {
      if (active.length - selected.length <= 18 || id === career.player.id) continue;
      const footballer = resolveCareerWorldFootballer(
        { ...career, worldDelta: { ...delta, footballerOverrides: overrides } },
        id,
      );
      if (!footballer || footballer.careerStatus === 'retired') continue;
      if (
        projectNpcRetirement({ footballer, boundaryDate, clubContext: club, seed: career.seed })
          .retires
      )
        selected.push(id);
    }
    if (!selected.length) continue;
    const selectedSet = new Set(selected);
    squadOverrides[club.id] = active.filter((id) => !selectedSet.has(id));
    for (const id of selected) {
      const footballer = resolveCareerWorldFootballer(
        { ...career, worldDelta: { ...delta, footballerOverrides: overrides } },
        id,
      );
      if (!footballer) continue;
      retired.add(id);
      overrides[id] = {
        ...footballer,
        careerStatus: 'retired',
        currentClubId: undefined,
        currentContract: undefined,
      };
    }
  }
  // Canonical base-world professionals start in static squads, which were traversed above.
  // Career-created unattached players and later detachments are necessarily represented in the
  // sparse delta, so retirement does not need a second scan over the entire static registry.
  const seen = new Set<string>();
  const processUnattached = (id: string, fallback: WorldFootballer) => {
    if (seen.has(id)) return;
    seen.add(id);
    const footballer = overrides[id] ?? delta.newFootballers[id] ?? fallback;
    if (id === career.player.id || retired.has(id) || footballer.currentClubId) return;
    if (!projectNpcRetirement({ footballer, boundaryDate, seed: career.seed }).retires) return;
    retired.add(id);
    overrides[id] = { ...footballer, careerStatus: 'retired', currentContract: undefined };
  };
  for (const id in overrides) processUnattached(id, overrides[id]!);
  for (const id in delta.newFootballers)
    if (!(id in overrides)) processUnattached(id, delta.newFootballers[id]!);
  delta = {
    ...delta,
    footballerOverrides: overrides,
    squadOverrides,
    retiredFootballerIds: [...retired],
    npcRetirementProcessedThroughSeason: season,
  };
  return { ...career, worldDelta: delta };
};
