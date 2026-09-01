import { describe, expect, test } from 'vitest';
import { deriveDateOfBirth, getAgeOnDate } from './age';

describe('calendar age', () => {
  test.each([
    ['2000-05-10', '2026-05-09', 25],
    ['2000-05-10', '2026-05-10', 26],
    ['2000-05-10', '2026-12-31', 26],
    ['2000-12-31', '2027-01-01', 26],
    ['2000-02-29', '2025-02-28', 24],
    ['2000-02-29', '2025-03-01', 25],
  ])('%s on %s is %i', (birth, date, age) => {
    expect(getAgeOnDate(birth, date)).toBe(age);
  });

  test('legacy derivation is deterministic and preserves the known age', () => {
    const first = deriveDateOfBirth(16, '2026-07-01', 'person_stable');
    expect(deriveDateOfBirth(16, '2026-07-01', 'person_stable')).toBe(first);
    expect(getAgeOnDate(first, '2026-07-01')).toBe(16);
  });
});
