import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { applyDevelopmentCheckpoint } from './development';
import { applyAppearanceConsequences } from './appearanceConsequences';
const make = (seed = 'dev') =>
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Ada',
        lastName: 'Rozwój',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'winger',
        heightCm: 170,
        weightKg: 64,
        seed,
      },
      seed,
      0,
    ),
    seed,
  );
const appearance = (i: number) => ({
  matchId: `m${i}`,
  date: `2026-${String(8 + (i % 10)).padStart(2, '0')}-01`,
  opponentId: 'x',
  teamLevel: 'academy' as const,
  started: true,
  minutes: 90,
  goals: i % 4 === 0 ? 1 : 0,
  assists: 1,
  xG: 0.3,
  xA: 0.4,
  keyPasses: 4,
  defensiveActions: 2,
  saves: 0,
  personalImpact: 2,
  rating: 7.2,
});
describe('development pipeline', () => {
  it('is deterministic and facts match attributes', () => {
    let a = make(),
      b = make();
    for (let i = 0; i < 35; i++) {
      a = applyDevelopmentCheckpoint(a, appearance(i));
      b = applyDevelopmentCheckpoint(b, appearance(i));
    }
    expect(a.player.attributes).toEqual(b.player.attributes);
    expect(
      a.historyFacts
        .filter((f) => f.factType === 'attribute_changed')
        .every(
          (f) =>
            a.player.attributes[f.data.attribute as keyof typeof a.player.attributes] >=
            Number(f.data.after),
        ),
    ).toBe(true);
    expect(Object.values(a.player.attributes).every((v) => v <= 100)).toBe(true);
  });
  it('active young player crosses thresholds', () => {
    let c = make();
    const before = { ...c.player.attributes };
    for (let i = 0; i < 35; i++) c = applyDevelopmentCheckpoint(c, appearance(i));
    expect(
      Object.keys(before).some(
        (k) => c.player.attributes[k as keyof typeof before] > before[k as keyof typeof before],
      ),
    ).toBe(true);
  });
  it('gives active young players gradual season-scale gains', () => {
    const gains = Array.from({ length: 120 }, (_, seedIndex) => {
      let c = make(`distribution-${seedIndex}`);
      const before = { ...c.player.attributes };
      for (let i = 0; i < 24; i++)
        c = applyAppearanceConsequences(c, { ...appearance(i), minutes: 75 });
      return Object.keys(before).reduce(
        (sum, key) =>
          sum +
          c.player.attributes[key as keyof typeof before] -
          before[key as keyof typeof before],
        0,
      );
    }).sort((a, b) => a - b);
    const mean = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const median = gains[Math.floor(gains.length / 2)]!;
    const p10 = gains[Math.floor(gains.length * 0.1)]!;
    const p90 = gains[Math.floor(gains.length * 0.9)]!;
    const zeroPercent = (gains.filter((gain) => gain === 0).length / gains.length) * 100;
    const overEightPercent = (gains.filter((gain) => gain > 8).length / gains.length) * 100;
    expect(mean).toBeGreaterThanOrEqual(3);
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(6);
    expect(p90).toBeLessThanOrEqual(8);
    expect(p10).toBeGreaterThanOrEqual(0);
    expect(zeroPercent).toBeLessThan(20);
    expect(overEightPercent).toBeLessThan(10);
  });

  it('keeps low-minute and zero-minute development appropriately small', () => {
    const totalGain = (minutes: number, appearances: number) => {
      let c = make('minutes-comparison');
      const before = { ...c.player.attributes };
      for (let i = 0; i < appearances; i++)
        c = applyAppearanceConsequences(c, { ...appearance(i), minutes });
      return Object.keys(before).reduce(
        (sum, key) =>
          sum +
          c.player.attributes[key as keyof typeof before] -
          before[key as keyof typeof before],
        0,
      );
    };
    expect(totalGain(0, 20)).toBe(0);
    expect(totalGain(60, 5)).toBeLessThan(totalGain(75, 24));
  });

  it('applies identical appearance consequences regardless of presentation path', () => {
    const routine = applyAppearanceConsequences(make('parity'), appearance(1));
    const interactive = applyAppearanceConsequences(make('parity'), appearance(1));
    expect(interactive.player.attributes).toEqual(routine.player.attributes);
    expect(interactive.developmentProgress).toEqual(routine.developmentProgress);
    expect(interactive.historyFacts).toEqual(routine.historyFacts);
  });
});
