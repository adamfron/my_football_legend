import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type { CareerState, Id, PlayerPosition } from '../types/domain';
import {
  createCareerWorldFootballerResolver,
  emptyWorldDelta,
  resolveYouthCohort,
} from './worldDatabase';
import { deriveYouthTeamQuality, YOUTH_COHORT_TARGET_POSITIONS } from './youthWorld';
import { createProceduralFootballerId } from './proceduralFootballers';

/** Replenishes the next U-17 cohort without replacing eligible players or touching static data. */
export const processYouthIntake = (
  career: CareerState,
  completedSeason = career.currentSeason,
  reuseOwnedDeltaMaps = false,
) => {
  const nextSeason = completedSeason + 1;
  let delta = career.worldDelta ?? emptyWorldDelta();
  const youthCohortOverrides = reuseOwnedDeltaMaps
    ? (delta.youthCohortOverrides ?? {})
    : { ...delta.youthCohortOverrides };
  const clubsById = new Map((career.clubWorld ?? []).map((club) => [club.id, club]));
  const resolveFootballer = createCareerWorldFootballerResolver(career);
  for (const team of getPolishU17TeamDefinitions(career.clubWorld ?? [])) {
    const nextKey = getYouthCohortKey(team.id, nextSeason);
    if (delta.youthCohortOverrides?.[nextKey] !== undefined) continue;
    const retained = [
      ...(resolveYouthCohort(career, getYouthCohortKey(team.id, completedSeason)) ?? []),
    ];
    const positionCounts = new Map<PlayerPosition, number>();
    for (const id of retained) {
      const footballer = resolveFootballer(id);
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
    // Keep this dependency explicit: changes to academy quality intentionally version generation.
    if (parent) deriveYouthTeamQuality(parent);
    const generated: Id[] = [];
    for (
      let slot = 0;
      retained.length + generated.length < YOUTH_COHORT_TARGET_POSITIONS.length;
      slot++
    ) {
      const primaryPosition =
        missing[generated.length] ?? YOUTH_COHORT_TARGET_POSITIONS[generated.length]!;
      const id = createProceduralFootballerId({
        kind: 'intake',
        ownerId: team.parentClubId ?? team.id,
        season: nextSeason,
        position: primaryPosition,
        slot,
      });
      generated.push(id);
    }
    youthCohortOverrides[nextKey] = [...new Set([...retained, ...generated])];
  }
  // Completed cohorts are reconstructible and have no operational value in an active save.
  for (const key of Object.keys(youthCohortOverrides))
    if (Number(key.slice(-4)) < completedSeason) delete youthCohortOverrides[key];
  delta = { ...delta, newFootballers: {}, youthCohortOverrides };
  return { ...career, worldDelta: delta };
};
