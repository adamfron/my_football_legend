import { describe, expect, it } from 'vitest';
import { createCareerState, generateStartingPlayerProfile } from './playerCreator';
import { applyDevelopmentCheckpoint, applyTrainingDevelopmentCheckpoint } from './development';
import { applyAppearanceConsequences } from './appearanceConsequences';
import { getPlayerOverall } from './playerOverall';
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
      const before = getPlayerOverall(c.player, c.player.primaryPosition);
      for (let i = 0; i < 24; i++)
        c = applyAppearanceConsequences(c, { ...appearance(i), minutes: 75 });
      return getPlayerOverall(c.player, c.player.primaryPosition) - before;
    }).sort((a, b) => a - b);
    const mean = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
    const median = gains[Math.floor(gains.length / 2)]!;
    const p10 = gains[Math.floor(gains.length * 0.1)]!;
    const p90 = gains[Math.floor(gains.length * 0.9)]!;
    const zeroPercent = (gains.filter((gain) => gain === 0).length / gains.length) * 100;
    const overEightPercent = (gains.filter((gain) => gain > 8).length / gains.length) * 100;
    expect(mean).toBeGreaterThanOrEqual(3);
    expect(median).toBeGreaterThanOrEqual(3);
    expect(median).toBeLessThanOrEqual(7);
    expect(p90).toBeLessThanOrEqual(8);
    expect(p10).toBeGreaterThanOrEqual(3);
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

  it('makes high-potential starters in strong environments clearly outperform weak cohorts', () => {
    const simulate = (seed: string, potential: number, strong: boolean, regular: boolean) => {
      let c = make(seed);
      c = {
        ...c,
        player: { ...c.player, potential },
        currentProfessionalClub: {
          id: 'development-club',
          name: 'Klub Rozwoju',
          country: 'Polska',
          region: 'Mazowsze',
          leagueTier: 3,
          reputation: 50,
          overallStrength: 50,
          financialLevel: 50,
          playingStyle: 'techniczny',
          youthPolicy: strong ? 90 : 25,
          developmentReputation: strong ? 90 : 25,
          sellingClubTendency: 50,
          pressureLevel: 50,
          coachYouthTrust: strong ? 90 : 25,
          archetype: 'LOCAL_DEVELOPMENT',
          positionalNeeds: {
            goalkeeper: { starterQuality: 50, depth: 'normal', needLevel: 50 },
            defense: { starterQuality: 50, depth: 'normal', needLevel: 50 },
            midfield: { starterQuality: 50, depth: 'normal', needLevel: 50 },
            attack: { starterQuality: 50, depth: 'normal', needLevel: 50 },
          },
        },
        careerSeasonNumber: 2,
      };
      for (let season = 0; season < 4; season++) {
        c = { ...c, currentSeason: 2027 + season, player: { ...c.player, age: 16 + season } };
        for (let month = 7; month <= 16; month++) {
          const normalizedMonth = month > 12 ? month - 12 : month;
          const year = month > 12 ? 2028 + season : 2027 + season;
          c = applyTrainingDevelopmentCheckpoint(
            c,
            `${year}-${String(normalizedMonth).padStart(2, '0')}`,
          );
          if (regular)
            for (let match = 0; match < 2; match++)
              c = applyAppearanceConsequences(c, {
                ...appearance(season * 20 + month * 2 + match),
                matchId: `${seed}-${season}-${month}-${match}`,
                date: `${year}-${String(normalizedMonth).padStart(2, '0')}-${String(10 + match).padStart(2, '0')}`,
                minutes: 78,
              });
        }
      }
      return getPlayerOverall(c.player, c.player.primaryPosition);
    };
    const median = (values: number[]) =>
      [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
    const high = Array.from({ length: 30 }, (_, index) =>
      simulate(`high-${index}`, 88, true, true),
    );
    const low = Array.from({ length: 30 }, (_, index) =>
      simulate(`low-${index}`, 60, false, false),
    );
    expect(median(high)).toBeGreaterThanOrEqual(70);
    expect(median(high) - median(low)).toBeGreaterThanOrEqual(12);
    expect(Math.min(...high)).toBeGreaterThan(Math.min(...low));
  });
});
