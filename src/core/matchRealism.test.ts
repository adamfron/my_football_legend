import { describe, expect, it } from 'vitest';
import type { MatchAppearance } from '../types/domain';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { initializeCurrentCareerWeek } from './careerWeeks';
import { getRoutineSubstituteEntryChance, projectFixtureParticipation } from './matchEngine';
import { simulateRoutinePlayerMatch } from './careerSimulation';
import {
  applyMatchAvailabilityEffects,
  resolveTerminalAppearanceEvents,
  rollMatchAvailabilityEffects,
} from './playerAvailability';

const careerAt = (position: 'goalkeeper' | 'attacking_midfielder', seed: string) => {
  const player = generateStartingPlayerProfile(
    {
      firstName: 'Jan',
      lastName: 'Nowak',
      nationality: 'PL',
      age: 16,
      dominantFoot: 'right',
      position,
      heightCm: 185,
      weightKg: 78,
      seed,
    },
    seed,
    0,
  );
  return initializeCurrentCareerWeek(createCareerState(player, seed));
};

describe('goalkeeper match realism', () => {
  it('keeps starting goalkeepers for 90 minutes and does not introduce bench goalkeepers', () => {
    const career = careerAt('goalkeeper', 'goalkeeper-participation');
    const projections = career.careerCalendar!.fixtures.map((fixture) =>
      projectFixtureParticipation(career, fixture),
    );
    for (const projection of projections) {
      if (projection.started) expect(projection.plannedMinutes).toBe(90);
      if (projection.status.endsWith('bench')) expect(projection.willPlay).toBe(false);
    }
    expect(projections.some((projection) => projection.started)).toBe(true);
    expect(getRoutineSubstituteEntryChance('goalkeeper')).toBe(0);
    expect(getRoutineSubstituteEntryChance('attacking_midfielder')).toBe(0.7);
  });

  it('preserves the established outfield starter minute range', () => {
    const career = careerAt('attacking_midfielder', 'outfield-participation');
    const starter = career
      .careerCalendar!.fixtures.map((fixture) => projectFixtureParticipation(career, fixture))
      .find((projection) => projection.started)!;
    expect(starter.plannedMinutes).toBeGreaterThanOrEqual(72);
    expect(starter.plannedMinutes).toBeLessThanOrEqual(90);
  });

  it('uses canonical goalkeeper performance without generic attacking leakage', () => {
    const career = careerAt('goalkeeper', 'goalkeeper-statistics');
    const fixture = career.careerCalendar!.fixtures[0]!;
    const simulated = simulateRoutinePlayerMatch(career, fixture, {
      status: 'academy_starter',
      teamLevel: 'academy',
      started: true,
      willPlay: true,
      plannedMinutes: 90,
    });
    const record = simulated.seasonParticipation!.find((item) => item.fixtureId === fixture.id)!;
    expect(record.xG).toBe(0);
    expect(record.xA).toBeLessThanOrEqual(0.08);
    expect(record.goalkeeperStats).toBeDefined();
    const stats = record.goalkeeperStats!;
    expect(stats.saves + stats.goalsConceded).toBe(stats.shotsOnTargetFaced);
    expect(stats.cleanSheet).toBe(stats.goalsConceded === 0);
    expect(record.rating).toBe(stats.rating);
  });
});

describe('terminal appearance chronology', () => {
  it('uses only the earliest terminal event', () => {
    expect(resolveTerminalAppearanceEvents(90, { injuryMinute: 42, dismissalMinute: 71 })).toEqual({
      minutes: 42,
      injuryMinute: 42,
    });
    expect(resolveTerminalAppearanceEvents(90, { injuryMinute: 78, dismissalMinute: 55 })).toEqual({
      minutes: 55,
      dismissalMinute: 55,
    });
    expect(resolveTerminalAppearanceEvents(75, {})).toEqual({ minutes: 75 });
  });

  it('never records a terminal event beyond final appearance minutes and applies effects once', () => {
    const base = careerAt('attacking_midfielder', 'availability-idempotence');
    const raw: MatchAppearance = {
      matchId: 'terminal-match',
      date: '2026-09-01',
      opponentId: 'opponent',
      teamLevel: 'senior',
      started: true,
      minutes: 90,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
      keyPasses: 0,
      defensiveActions: 500,
      saves: 0,
      personalImpact: 0,
    };
    const rolled = rollMatchAvailabilityEffects(base, raw).appearance;
    expect(rolled.dismissedMinute ?? rolled.minutes).toBeLessThanOrEqual(rolled.minutes);
    expect(!(rolled.redCard && rolled.injuryId)).toBe(true);

    const once = applyMatchAvailabilityEffects(base, raw, raw.date);
    const twice = applyMatchAvailabilityEffects(once.career, raw, raw.date);
    expect(twice.career.playerAvailability).toEqual(once.career.playerAvailability);
    expect(twice.facts).toEqual([]);
  });
});
