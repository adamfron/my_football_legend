import { describe, expect, it } from 'vitest';
import type { SeasonParticipationRecord } from '../types/domain';
import { assertFixtureLedger, getCareerTotals } from './careerStats';
import { getMatchEffortEffects, getTrainingEffortEffects } from './playerPreferences';
import { dedupePeople } from './people';

const fixture = (id: string, started: boolean, minutes: number): SeasonParticipationRecord => ({
  fixtureId: id,
  date: '2027-05-01',
  opponentId: 'opponent',
  venue: 'home',
  competition: 'Polska Liga U-17',
  status: minutes ? (started ? 'starter' : 'substitute') : 'not_selected',
  plannedMinutes: minutes,
  minutes,
  started,
  goals: 0,
  assists: 0,
  xG: 0,
  xA: 0,
});

describe('career consistency', () => {
  it('derives mathematically valid totals from one fixture ledger', () => {
    const ledger = Array.from({ length: 30 }, (_, index) =>
      fixture(String(index), index < 10, index < 14 ? 60 : 0),
    );
    const totals = assertFixtureLedger(ledger);
    expect(totals.appearances).toBe(14);
    expect(totals.starts).toBe(10);
    expect(totals.starts).toBeLessThanOrEqual(totals.appearances);
  });
  it('rejects duplicate fixtures and zero-minute invented statistics', () => {
    expect(() =>
      assertFixtureLedger([fixture('same', false, 0), fixture('same', false, 0)]),
    ).toThrow();
    expect(() => assertFixtureLedger([{ ...fixture('bad', false, 0), goals: 1 }])).toThrow();
  });
  it('sums archived season totals without creating a second counter', () => {
    const season = { player: { appearances: 14, starts: 10, minutes: 800, goals: 2, assists: 3 } };
    expect(getCareerTotals([season, season] as never)).toEqual({
      appearances: 28,
      starts: 20,
      minutes: 1600,
      goals: 4,
      assists: 6,
    });
  });
  it('makes level five costly rather than automatically optimal', () => {
    expect(getMatchEffortEffects(5).fitnessCostMultiplier).toBeGreaterThan(
      getMatchEffortEffects(3).fitnessCostMultiplier,
    );
    expect(getTrainingEffortEffects(5).developmentStimulus).toBeGreaterThan(
      getTrainingEffortEffects(3).developmentStimulus,
    );
    expect(getTrainingEffortEffects(5).fatigue).toBeGreaterThan(
      getTrainingEffortEffects(3).fatigue,
    );
  });
  it('deduplicates a persistent identity despite a role change', () => {
    const person = { id: 'p1', firstName: 'Jan', lastName: 'Kowalski', role: 'coach' };
    expect(
      dedupePeople([person, { ...person, id: 'p2', role: 'former_coach' }] as never),
    ).toHaveLength(1);
  });
});
