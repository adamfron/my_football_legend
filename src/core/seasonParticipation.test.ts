import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import {
  getExpectedAvailableMinuteShare,
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
        position: 'central_midfielder',
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

  it('exposes deterministic injury diagnosis and remaining matches', () => {
    const state = career();
    state.playerAvailability = {
      injuries: [
        {
          id: 'injury',
          startDate: '2027-09-01',
          severity: 'minor',
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
