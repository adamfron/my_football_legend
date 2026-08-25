import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { applyDevelopmentCheckpoint } from './development';
const make = () =>
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
        seed: 'dev',
      },
      'dev',
      0,
    ),
    'dev',
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
});
