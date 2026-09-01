import { describe, expect, test } from 'vitest';
import { generateProfessionalClubPool } from './professionalClubs';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { getYouthCohortKey } from '../content/world/polishU17';
import { deriveSquadHierarchy, getManagerPreferredFormation } from './footballerWorld';
import { advanceCareerFlow } from './careerFlow';
import { evaluateSquadOpportunity, projectFixtureParticipation } from './matchEngine';
import { simulateRoutinePlayerMatch } from './careerSimulation';
import {
  deriveYouthTeamQuality,
  getYouthSquadSelectionContext,
  populatePolishU17World,
} from './youthWorld';

describe('persistent Polish U-17 world', () => {
  const clubs = generateProfessionalClubPool('youth-test');

  test('derives quality mainly from academy environment', () => {
    const base = clubs[0]!;
    const excellentAcademy = {
      ...base,
      developmentReputation: 90,
      youthPolicy: 90,
      infrastructure: { ...base.infrastructure!, coachingQuality: 90, trainingFacilities: 90 },
    };
    const weakAcademy = {
      ...base,
      developmentReputation: 30,
      youthPolicy: 30,
      infrastructure: { ...base.infrastructure!, coachingQuality: 35, trainingFacilities: 35 },
    };
    expect(
      deriveYouthTeamQuality(excellentAcademy) - deriveYouthTeamQuality(weakAcademy),
    ).toBeGreaterThan(30);
    expect(
      deriveYouthTeamQuality({ ...base, strengthRating: 85 }) -
        deriveYouthTeamQuality({ ...base, strengthRating: 35 }),
    ).toBeLessThanOrEqual(3);
  });

  test('generates byte-equivalent cohorts from the same seed', () => {
    expect(JSON.stringify(populatePolishU17World(clubs, 'stable'))).toBe(
      JSON.stringify(populatePolishU17World(clubs, 'stable')),
    );
  });

  test('projects the protagonist once over the immutable 24-player Vistula cohort', () => {
    const state = createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Test',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'striker',
          heightCm: 181,
          weightKg: 75,
          seed: 'playable-youth',
        },
        'playable-youth',
        0,
      ),
      'playable-youth',
    );
    const key = getYouthCohortKey('club_vistula_nova', 2026);
    const canonical = state.youthCohorts![key]!;
    const context = getYouthSquadSelectionContext(state, 'club_vistula_nova')!;
    expect(canonical).toHaveLength(24);
    expect(context.squadPlayerIds).toHaveLength(25);
    expect(context.squadPlayerIds!.filter((id) => id === state.player.id)).toHaveLength(1);
    expect(canonical).not.toContain(state.player.id);
    expect(context.managerId).toBe('coach_vistula_nova');
    expect(canonical.every((id) => Boolean(state.footballerWorld?.[id]))).toBe(true);
    const hierarchy = deriveSquadHierarchy(
      state,
      context,
      getManagerPreferredFormation(context.managerId),
    );
    expect(hierarchy.preferredXI).toHaveLength(11);
    expect(hierarchy.bench).toHaveLength(7);
    expect(hierarchy.deepReserve).toHaveLength(7);
  });

  test('uses the youth hierarchy for selection and stores its real assignment', () => {
    let state = createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Starter',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'striker',
          heightCm: 181,
          weightKg: 75,
          difficulty: 'easy',
          seed: 'youth-assignment',
        },
        'youth-assignment',
        0,
      ),
      'youth-assignment',
    );
    state = advanceCareerFlow(state);
    const context = getYouthSquadSelectionContext(state, 'club_vistula_nova')!;
    const hierarchy = deriveSquadHierarchy(state, context);
    const assignment = [...hierarchy.preferredXI, ...hierarchy.bench].find(
      (item) => item.footballerId === state.player.id,
    );
    const opportunity = evaluateSquadOpportunity(state, {
      fixtureIndex: 0,
      fixtureId: state.careerCalendar!.fixtures[0]!.id,
      opponent: state.careerCalendar!.fixtures[0]!.opponent,
      venue: state.careerCalendar!.fixtures[0]!.venue,
    });
    const expectedStatus = hierarchy.preferredXI.some(
      (item) => item.footballerId === state.player.id,
    )
      ? 'academy_starter'
      : hierarchy.bench.some((item) => item.footballerId === state.player.id)
        ? 'academy_bench'
        : 'no_match';
    expect(opportunity.status).toBe(expectedStatus);
    const playable = state.careerCalendar!.fixtures.find(
      (fixture) => projectFixtureParticipation(state, fixture).plannedMinutes > 0,
    );
    if (assignment && playable) {
      const played = simulateRoutinePlayerMatch(state, playable);
      expect(played.matchHistory?.at(-1)?.assignedPosition).toBe(assignment.position);
      expect(
        played.seasonParticipation?.find((row) => row.fixtureId === playable.id)?.assignedPosition,
      ).toBe(assignment.position);
    } else {
      expect(assignment).toBeUndefined();
      expect(playable).toBeUndefined();
    }
  });
});
