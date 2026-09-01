import { describe, expect, it } from 'vitest';
import { advanceCareerFlow } from './careerFlow';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { initializeCareerSeason } from './careerSeasons';
import { initializeSeasonParticipation } from './seasonParticipation';
import { buildSeasonTimeline } from './seasonTimeline';
import { getCareerProgressBlocker } from './careerSimulation';
import { getPolishU17TeamDefinitions, getYouthTeamDisplayName } from '../content/world/polishU17';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Test',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'left_winger',
        heightCm: 175,
        weightKg: 68,
        seed: 'normal-u17',
      },
      'normal-u17',
      0,
    ),
    'normal-u17',
  );

describe('career flow', () => {
  it('starts directly with one normal full Vistula Nova U-17 season', () => {
    const started = advanceCareerFlow(career());
    expect(started.currentClub.name).toBe('Vistula Nova');
    expect(started.player.age).toBe(16);
    expect(started.leagueSeason?.competition.category).toBe('youth');
    expect(started.leagueSeason?.competition.name).toMatch(/U-17/);
    expect(started.leagueSeason?.clubs).toHaveLength(12);
    const parents = new Map(started.clubWorld!.map((club) => [club.id, club]));
    const expectedNames = getPolishU17TeamDefinitions(started.clubWorld!).map((team) =>
      getYouthTeamDisplayName(team, team.parentClubId ? parents.get(team.parentClubId) : undefined),
    );
    expect(started.leagueSeason?.clubs.map((club) => club.name)).toEqual(expectedNames);
    expect(started.leagueSeason?.clubs.map((club) => club.name)).not.toContain('Orkan Brzeziny');
    expect(started.careerCalendar?.fixtures).toHaveLength(22);
    expect(started.activeEvent).toBeUndefined();
    expect(started.decisionPoint).toBeUndefined();
    expect(getCareerProgressBlocker(started)).toBeUndefined();
  });

  it('preserves the canonical autumn-spring chronology in every season projection', () => {
    const started = initializeCareerSeason(career(), {
      startYear: 2026,
      careerSeasonNumber: 1,
      club: career().currentClub,
      professional: false,
    });
    const leagueFixtures = started.leagueSeason!.rounds.flatMap((round) => round.fixtures);
    const autumn = leagueFixtures.filter((fixture) => fixture.date.startsWith('2026-'));
    const spring = leagueFixtures.filter((fixture) => fixture.date.startsWith('2027-'));

    expect(autumn.length).toBeGreaterThan(0);
    expect(spring.length).toBeGreaterThan(0);
    expect(leagueFixtures.every((fixture) => fixture.date >= started.currentDate!)).toBe(true);
    expect(started.leagueSeason!.startDate).toBe(leagueFixtures[0]!.date);
    expect(started.leagueSeason!.endDate >= leagueFixtures.at(-1)!.date).toBe(true);
    for (const calendarFixture of started.careerCalendar!.fixtures) {
      const leagueFixture = leagueFixtures.find((fixture) => fixture.id === calendarFixture.id)!;
      expect(calendarFixture.date).toBe(leagueFixture.date);
      expect(
        started.seasonParticipation!.find((row) => row.fixtureId === calendarFixture.id),
      ).toBeDefined();
    }
    expect(
      buildSeasonTimeline(started)
        .filter((entry) => entry.kind === 'fixture')
        .every((entry) => entry.date >= started.currentDate!),
    ).toBe(true);
  });

  it('initializes exactly one scheduled participation row for every controlled-club fixture', () => {
    const base = career();
    const started = initializeCareerSeason(base, {
      startYear: base.currentSeason,
      careerSeasonNumber: base.careerSeasonNumber,
      club: base.currentClub,
      professional: false,
    });
    const fixtureIds = started
      .leagueSeason!.rounds.flatMap((round) => round.fixtures)
      .filter((fixture) =>
        [fixture.homeClubId, fixture.awayClubId].includes(started.leagueSeason!.controlledClubId),
      )
      .map((fixture) => fixture.id);

    expect(started.seasonParticipation).toHaveLength(fixtureIds.length);
    expect(new Set(started.seasonParticipation!.map((record) => record.fixtureId))).toEqual(
      new Set(fixtureIds),
    );
    expect(started.seasonParticipation).toEqual(
      expect.arrayContaining(
        fixtureIds.map((fixtureId) =>
          expect.objectContaining({
            fixtureId,
            fixtureStatus: 'scheduled',
            minutes: 0,
          }),
        ),
      ),
    );
  });

  it('preserves completed rows during idempotent ledger initialization', () => {
    const started = advanceCareerFlow(career());
    const completed = {
      ...started.seasonParticipation![0]!,
      fixtureStatus: 'completed' as const,
      status: 'starter' as const,
      plannedMinutes: 90,
      minutes: 90,
      started: true,
      goals: 1,
    };
    const updated = { ...started, seasonParticipation: [completed] };

    const repaired = initializeSeasonParticipation(initializeSeasonParticipation(updated));

    expect(repaired.seasonParticipation?.[0]).toEqual(completed);
    expect(repaired.seasonParticipation).toHaveLength(started.seasonParticipation!.length);
  });

  it('repairs an empty or incomplete version-2 prototype ledger in the canonical flow', () => {
    const started = advanceCareerFlow(career());
    const completed = {
      ...started.seasonParticipation![0]!,
      fixtureStatus: 'completed' as const,
      status: 'starter' as const,
      minutes: 75,
      started: true,
    };

    const repairedEmpty = advanceCareerFlow({ ...started, seasonParticipation: [] });
    const repairedIncomplete = advanceCareerFlow({ ...started, seasonParticipation: [completed] });

    expect(repairedEmpty.seasonParticipation).toHaveLength(started.seasonParticipation!.length);
    expect(repairedIncomplete.seasonParticipation).toHaveLength(
      started.seasonParticipation!.length,
    );
    expect(repairedIncomplete.seasonParticipation?.[0]).toEqual(completed);
  });

  it('does not restart a scripted onboarding arc', () => {
    const started = advanceCareerFlow(career());
    expect(advanceCareerFlow(started).leagueSeason?.id).toBe(started.leagueSeason?.id);
    expect(started.historyFacts.some((fact) => fact.factType === 'academy_selection_result')).toBe(
      false,
    );
  });
});
