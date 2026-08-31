import { RandomGenerator } from './random/RandomGenerator';
import { generateInjuryMetadata } from './playerAvailability';
import { getTimelineInjury, presentInjury } from './injuryPresentation';
import { presentMatchParticipation } from './matchParticipationPresentation';
import { deriveSeasonInjurySummary } from './seasonInjuries';

import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  getExpectedAvailableMinuteShare,
  deriveSeasonPositionUsage,
  getInjuryDescription,
  getParticipationTotals,
  recordParticipation,
  updateSelectionStanding,
} from './seasonParticipation';

const career = () =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Nowak',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'attacking_midfielder',
        heightCm: 178,
        weightKg: 72,
        seed: 'ledger',
      },
      'ledger',
      0,
    ),
    'ledger',
  );

describe('authoritative participation', () => {
  it('is idempotent per fixture and totals only played records', () => {
    const row = {
      fixtureId: 'f1',
      date: '2027-08-29',
      opponentId: 'other',
      venue: 'home' as const,
      competition: 'Liga',
      status: 'starter' as const,
      plannedMinutes: 90,
      minutes: 90,
      started: true,
      goals: 1,
      assists: 0,
      xG: 0.4,
      xA: 0,
      rating: 7.4,
    };
    const state = recordParticipation(recordParticipation(career(), row), { ...row, minutes: 80 });
    expect(state.seasonParticipation).toHaveLength(1);
    expect(getParticipationTotals(state.seasonParticipation!)).toMatchObject({
      appearances: 1,
      starts: 1,
      minutes: 80,
      goals: 1,
    });
  });

  it('gives important players a meaningfully higher expected share and preserves standing through absence', () => {
    expect(getExpectedAvailableMinuteShare('important_player').target).toBeGreaterThan(
      getExpectedAvailableMinuteShare('development_player').target,
    );
    expect(updateSelectionStanding(64, undefined)).toBeGreaterThan(60);
    expect(updateSelectionStanding(50, 8)).toBeGreaterThan(50);
  });

  it('derives actual positional usage and ignores non-appearances without an assignment', () => {
    const base = {
      fixtureId: 'position-1',
      date: '2027-09-01',
      opponentId: 'other',
      venue: 'home' as const,
      competition: 'Liga',
      status: 'starter' as const,
      plannedMinutes: 90,
      minutes: 80,
      started: true,
      assignedPosition: 'right_winger' as const,
      goals: 0,
      assists: 0,
      xG: 0,
      xA: 0,
    };
    expect(
      deriveSeasonPositionUsage([
        base,
        { ...base, fixtureId: 'position-2', minutes: 20, started: false, status: 'substitute' },
        {
          ...base,
          fixtureId: 'position-3',
          minutes: 0,
          started: false,
          status: 'unused_bench',
          assignedPosition: undefined,
        },
      ]),
    ).toEqual([{ position: 'right_winger', appearances: 2, starts: 1, minutes: 100 }]);
  });

  it('exposes deterministic injury diagnosis and remaining matches', () => {
    const state = career();
    state.playerAvailability = {
      injuries: [
        {
          id: 'injury',
          startDate: '2027-09-01',
          severity: 'minor',
          injuryType: 'strain',
          matchesRemaining: 2,
          source: 'match',
          status: 'active',
          bodyArea: 'thigh',
        },
      ],
      suspensionMatchesRemaining: 0,
      leagueYellowCards: 0,
      matchesMissedThroughSuspension: 0,
      matchesMissedThroughInjury: 0,
    };
    expect(getInjuryDescription(state)).toContain('około 2 meczów');
    expect(getInjuryDescription(state)).toContain('uda');
  });
});

describe('match and injury presentation metadata', () => {
  const played = {
    fixtureId: 'summary',
    date: '2027-09-02',
    opponentId: 'other',
    venue: 'home' as const,
    competition: 'Liga',
    fixtureStatus: 'completed' as const,
    status: 'starter' as const,
    plannedMinutes: 90,
    minutes: 76,
    started: true,
    goals: 0,
    assists: 1,
    xG: 0,
    xA: 0.2,
    rating: 7.6,
  };

  it('uses only the assigned position and exposes distinguishable cards', () => {
    expect(
      presentMatchParticipation({ ...played, assignedPosition: 'center_back' }).text,
    ).toContain("76' · ŚO");
    expect(presentMatchParticipation(played).text).not.toContain('ŚO');
    expect(presentMatchParticipation({ ...played, yellowCards: 1 }).cards).toEqual(['yellow']);
    expect(presentMatchParticipation({ ...played, redCard: 'direct' }).cards).toEqual(['red']);
    expect(presentMatchParticipation({ ...played, redCard: 'second_yellow' }).cards).toEqual([
      'yellow',
      'yellow',
      'red',
    ]);
  });

  it('preserves goalkeeper statistics', () => {
    const summary = presentMatchParticipation({
      ...played,
      assignedPosition: 'goalkeeper',
      goalkeeperStats: {
        goalsConceded: 0,
        shotsOnTargetFaced: 5,
        saves: 5,
        savePercentage: 100,
        cleanSheet: true,
        xGA: 1.1,
        errorsLeadingToGoal: 0,
        rating: 7.4,
      },
    }).text;
    expect(summary).toContain('BR · 5 obr. · CS · 7,4');
    expect(summary).not.toContain('0 G');
  });

  it('localizes canonical injury type, area, and every source', () => {
    const base = {
      id: 'i',
      startDate: '2027-09-01',
      severity: 'minor' as const,
      injuryType: 'strain' as const,
      matchesRemaining: 1,
      status: 'active' as const,
      bodyArea: 'thigh',
    };
    expect(presentInjury({ ...base, source: 'match' })).toBe('Naciągnięcie uda · podczas meczu');
    expect(presentInjury({ ...base, source: 'training' })).toContain('· trening');
    expect(presentInjury({ ...base, source: 'overload' })).toContain('· kumulacja obciążeń');
  });

  it('generates identical compatible injury metadata for identical seeds', () => {
    expect(generateInjuryMetadata(RandomGenerator.fromSeed('same'), 'training')).toEqual(
      generateInjuryMetadata(RandomGenerator.fromSeed('same'), 'training'),
    );
  });

  it('does not attach an unrelated current injury to an older absence', () => {
    const state = career();
    state.playerAvailability = {
      injuries: [
        {
          id: 'later',
          startDate: '2027-10-01',
          severity: 'minor',
          injuryType: 'sprain',
          matchesRemaining: 2,
          source: 'training',
          status: 'active',
          bodyArea: 'ankle',
        },
      ],
      suspensionMatchesRemaining: 0,
      leagueYellowCards: 0,
      matchesMissedThroughSuspension: 0,
      matchesMissedThroughInjury: 1,
    };
    expect(
      getTimelineInjury(state, {
        ...played,
        minutes: 0,
        started: false,
        status: 'injured',
        date: '2027-09-02',
      }),
    ).toBeUndefined();
  });

  it('aggregates one injury across its origin and later missed fixtures without counting the origin', () => {
    const state = career();
    const injury = {
      id: 'injury_origin',
      startDate: '2027-09-01',
      recoveryDate: '2027-09-15',
      severity: 'moderate' as const,
      injuryType: 'strain' as const,
      matchesRemaining: 0,
      source: 'match' as const,
      status: 'recovered' as const,
      bodyArea: 'thigh',
    };
    state.playerAvailability = {
      injuries: [injury],
      suspensionMatchesRemaining: 0,
      leagueYellowCards: 0,
      matchesMissedThroughSuspension: 0,
      matchesMissedThroughInjury: 2,
    };
    state.matchHistory = [
      {
        matchId: 'appearance_origin',
        date: injury.startDate,
        opponentId: 'rival',
        teamLevel: 'senior',
        started: true,
        minutes: 60,
        goals: 0,
        assists: 0,
        xG: 0,
        xA: 0,
        keyPasses: 0,
        defensiveActions: 0,
        saves: 0,
        personalImpact: 0,
        injuryId: injury.id,
      },
    ];
    const origin = { ...played, date: injury.startDate, appearanceMatchId: 'appearance_origin' };
    const missed = ['2027-09-08', '2027-09-15'].map((date, index) => ({
      ...played,
      fixtureId: `missed_${index}`,
      date,
      fixtureStatus: 'completed' as const,
      status: 'injured' as const,
      minutes: 0,
      started: false,
      appearanceMatchId: undefined,
    }));

    expect(deriveSeasonInjurySummary(state, [origin, ...missed])).toEqual([
      { injury, missedFixtures: 2 },
    ]);
    expect(presentInjury(injury, 'ongoing')).toBe('Naciągnięcie uda');
  });
});
