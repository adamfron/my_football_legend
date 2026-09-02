import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type { CareerState, Id, PlayerPosition, WorldFootballer } from '../types/domain';
import { generateCanonicalFootballerProfile } from './footballerWorld';
import { generateDevelopmentProfile } from './playerCreator';
import { RandomGenerator } from './random/RandomGenerator';
import { emptyWorldDelta, resolveYouthCohort } from './worldDatabase';
import { deriveYouthTeamQuality, YOUTH_COHORT_TARGET_POSITIONS } from './youthWorld';
import { WORLD_DATABASE_SEED } from './worldDatabase';

const clampQuality = (value: number) => Math.max(30, Math.min(65, Math.round(value)));
const canonicalIntakeCache = new Map<string, WorldFootballer>();

/** Replenishes the next U-17 cohort without replacing eligible players or touching static data. */
export const processYouthIntake = (career: CareerState, completedSeason = career.currentSeason) => {
  const nextSeason = completedSeason + 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  const newFootballers = { ...delta.newFootballers };
  const clubsById = new Map((career.clubWorld ?? []).map((club) => [club.id, club]));
  for (const team of getPolishU17TeamDefinitions(career.clubWorld ?? [])) {
    const nextKey = getYouthCohortKey(team.id, nextSeason);
    if (delta.youthCohortOverrides?.[nextKey] !== undefined) continue;
    const retained = [
      ...(resolveYouthCohort(career, getYouthCohortKey(team.id, completedSeason)) ?? []),
    ];
    const positionCounts = new Map<PlayerPosition, number>();
    for (const id of retained) {
      const footballer =
        delta.footballerOverrides[id] ?? delta.newFootballers[id] ?? career.footballerWorld?.[id];
      if (footballer)
        positionCounts.set(
          footballer.profile.primaryPosition,
          (positionCounts.get(footballer.profile.primaryPosition) ?? 0) + 1,
        );
    }
    const requiredCounts = new Map<PlayerPosition, number>();
    for (const position of YOUTH_COHORT_TARGET_POSITIONS)
      requiredCounts.set(position, (requiredCounts.get(position) ?? 0) + 1);
    const missing: PlayerPosition[] = [];
    for (const position of YOUTH_COHORT_TARGET_POSITIONS) {
      const required = requiredCounts.get(position) ?? 0;
      const present = positionCounts.get(position) ?? 0;
      if (missing.filter((item) => item === position).length < Math.max(0, required - present))
        missing.push(position);
    }
    const parent = team.parentClubId ? clubsById.get(team.parentClubId) : undefined;
    const baseline = parent ? deriveYouthTeamQuality(parent) : team.independentQuality!;
    const generated: Id[] = [];
    for (
      let slot = 0;
      retained.length + generated.length < YOUTH_COHORT_TARGET_POSITIONS.length;
      slot++
    ) {
      const id = `footballer_${team.id}_${nextSeason}_intake_${slot}`;
      const primaryPosition =
        missing[generated.length] ?? YOUTH_COHORT_TARGET_POSITIONS[generated.length]!;
      const existing = newFootballers[id];
      if (!existing) {
        const cached = canonicalIntakeCache.get(id);
        if (cached) {
          newFootballers[id] = cached;
          generated.push(id);
          continue;
        }
        const rng = RandomGenerator.fromSeed(`${WORLD_DATABASE_SEED}:${id}:youth`);
        const age = rng.bool(0.72) ? 16 : 15;
        const targetOverall = clampQuality(baseline + rng.int(-10, 10) + (slot % 6 === 0 ? 3 : 0));
        const profile = generateCanonicalFootballerProfile({
          id,
          seed: `${WORLD_DATABASE_SEED}:youth-intake:${nextSeason}`,
          age,
          referenceDate: `${nextSeason}-07-01`,
          targetOverall,
          primaryPosition,
        });
        const footballer: WorldFootballer = {
          profile,
          developmentProfile: generateDevelopmentProfile(
            RandomGenerator.fromSeed(`${WORLD_DATABASE_SEED}:${id}:development`),
          ),
          careerStatus: 'active',
          reputation: Math.max(1, targetOverall - 30),
          fitness: rng.int(78, 100),
        };
        canonicalIntakeCache.set(id, footballer);
        newFootballers[id] = footballer;
      }
      generated.push(id);
    }
    delta = {
      ...delta,
      newFootballers,
      youthCohortOverrides: {
        ...delta.youthCohortOverrides,
        [nextKey]: [...new Set([...retained, ...generated])],
      },
    };
  }
  return { ...career, worldDelta: delta };
};
