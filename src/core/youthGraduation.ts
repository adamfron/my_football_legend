import { getPolishU17TeamDefinitions, getYouthCohortKey } from '../content/world/polishU17';
import type { CareerState, Id } from '../types/domain';
import { getProfileAge } from './age';
import {
  createCareerWorldFootballerResolver,
  emptyWorldDelta,
  resolveYouthCohort,
} from './worldDatabase';

export const YOUTH_GRADUATION_AGE = 17;

export interface YouthGraduationDiagnostics {
  graduates: number;
  parentClubPromotions: number;
  externalFirstContracts: number;
  unattachedGraduates: number;
}

/**
 * Releases eligible academy players into the canonical summer pool. Contracting and parent-club
 * preference belong exclusively to processSummerSquadMarket.
 */
export const processYouthGraduation = (
  career: CareerState,
  season = career.currentSeason,
): { career: CareerState; diagnostics: YouthGraduationDiagnostics } => {
  const source = career.worldDelta ?? emptyWorldDelta();
  if ((source.youthGraduationProcessedThroughSeason ?? -1) >= season)
    return {
      career,
      diagnostics: {
        graduates: 0,
        parentClubPromotions: 0,
        externalFirstContracts: 0,
        unattachedGraduates: 0,
      },
    };
  const delta = {
    ...source,
    youthCohortOverrides: { ...source.youthCohortOverrides },
    footballerStateOverrides: { ...source.footballerStateOverrides },
  };
  const boundaryDate = `${season + 1}-06-30`;
  const resolve = createCareerWorldFootballerResolver({
    ...career,
    currentDate: boundaryDate,
    worldDelta: delta,
  });
  const graduates: Id[] = [];
  for (const team of getPolishU17TeamDefinitions(career.clubWorld ?? [])) {
    const key = getYouthCohortKey(team.id, season);
    const cohort = resolveYouthCohort(career, key);
    if (!cohort) continue;
    const remaining: Id[] = [];
    for (const id of cohort) {
      if (id === career.player.id) continue;
      const player = resolve(id);
      if (
        player &&
        getProfileAge(player.profile, boundaryDate, `${season}-07-01`) >= YOUTH_GRADUATION_AGE
      ) {
        graduates.push(id);
        delta.footballerStateOverrides[id] = {
          currentClubId: null,
          currentContract: null,
          careerStatus: 'active',
        };
      } else if (player) remaining.push(id);
    }
    delta.youthCohortOverrides[key] = remaining;
  }
  delta.currentGraduateIds = [...new Set(graduates)].sort();
  delta.youthGraduationProcessedThroughSeason = season;
  return {
    career: { ...career, worldDelta: delta },
    diagnostics: {
      graduates: graduates.length,
      parentClubPromotions: 0,
      externalFirstContracts: 0,
      unattachedGraduates: graduates.length,
    },
  };
};
