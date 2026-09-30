import { describe, expect, it } from 'vitest';
import { formatDiagnosticMatchTime, formatMatchTime } from './matchTime';

describe('match clock presentation', () => {
  it.each([
    [0, '00:00'],
    [7.975, '00:07'],
    [763.999, '12:43'],
    [5398.725, '89:58'],
    [59.999, '00:59'],
    [60, '01:00'],
  ])('shows canonical %s seconds as %s to the player', (seconds, expected) => {
    expect(formatMatchTime(seconds)).toBe(expected);
  });

  it('retains canonical tick precision only in the diagnostic formatter', () => {
    expect(formatDiagnosticMatchTime(7.025)).toBe('00:07.025');
    expect(formatDiagnosticMatchTime(59.9996)).toBe('01:00.000');
  });
});
