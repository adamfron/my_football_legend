import type { CareerState, ProfessionalClub, WorldFootballer } from '../types/domain';
import { getProfileAge } from './age';
import { getPlayerOverall } from './playerOverall';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta } from './worldDatabase';

export interface NpcRetirementProjection {
  retires: boolean;
  probability: number;
  reason: 'age_and_career_context' | 'continues';
}

/** Pure retirement decision; optional context is intentionally extensible for later match signals. */
export const projectNpcRetirement = (options: {
  footballer: WorldFootballer;
  boundaryDate: string;
  clubContext?: ProfessionalClub;
  seed: string;
}): NpcRetirementProjection => {
  const { footballer, boundaryDate, seed } = options;
  const age = getProfileAge(footballer.profile, boundaryDate, '2026-07-01');
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

/**
 * Removes retirees sparsely. The 18-player floor is a temporary bridge until NPC transfers
 * provide ordinary replacements; it deliberately does not optimize or regenerate senior squads.
 */
export const processNpcRetirements = (career: CareerState, boundaryDate: string): CareerState => {
  const season = Number(boundaryDate.slice(0, 4)) - 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  if ((delta.npcRetirementProcessedThroughSeason ?? -1) >= season) return career;
  const clubs = career.clubWorld ?? [];
  const retired = new Set(delta.retiredFootballerIds);
  const overrides = { ...delta.footballerOverrides };
  const squadOverrides = { ...delta.squadOverrides };
  for (const club of clubs) {
    const squad = squadOverrides[club.id] ?? club.squadPlayerIds ?? [];
    const active = squad.filter((id) => id === career.player.id || !retired.has(id));
    const selected: string[] = [];
    for (const id of active) {
      if (active.length - selected.length <= 18 || id === career.player.id) continue;
      const footballer = overrides[id] ?? delta.newFootballers[id] ?? career.footballerWorld?.[id];
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
      const footballer = overrides[id] ?? delta.newFootballers[id] ?? career.footballerWorld?.[id];
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
  // Unattached players are not constrained by the professional squad safeguard.
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
  for (const [id, footballer] of Object.entries(overrides)) processUnattached(id, footballer);
  for (const [id, footballer] of Object.entries(delta.newFootballers))
    processUnattached(id, footballer);
  for (const [id, footballer] of Object.entries(career.footballerWorld ?? {}))
    processUnattached(id, footballer);
  delta = {
    ...delta,
    footballerOverrides: overrides,
    squadOverrides,
    retiredFootballerIds: [...retired],
    npcRetirementProcessedThroughSeason: season,
  };
  return { ...career, worldDelta: delta };
};
