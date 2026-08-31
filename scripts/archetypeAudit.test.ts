import { describe, expect, it } from 'vitest';
import { getEligibleFootballArchetypes } from '../src/core/footballArchetypes';
import { attributeKeys, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { getTheoreticalPositionOverall, PLAYER_POSITIONS } from '../src/core/playerOverall';
import type { CareerDifficulty, PlayerPosition } from '../src/types/domain';

const input = (position: PlayerPosition, difficulty: CareerDifficulty, seed: string) => ({
  firstName: 'Audyt',
  lastName: 'Modelu',
  nationality: 'PL' as const,
  age: 16 as const,
  dominantFoot: 'right' as const,
  difficulty,
  position,
  heightCm: 183,
  weightKg: 78,
  seed,
});
const correlation = (a: number[], b: number[]) => {
  const ma = a.reduce((x, y) => x + y) / a.length,
    mb = b.reduce((x, y) => x + y) / b.length;
  const da = a.map((x) => x - ma),
    db = b.map((x) => x - mb);
  return (
    da.reduce((s, x, i) => s + x * db[i]!, 0) /
    Math.sqrt(da.reduce((s, x) => s + x * x, 0) * db.reduce((s, x) => s + x * x, 0))
  );
};

describe('local archetype separability audit (1,000 profiles per centroid)', () => {
  it('prints deterministic centroid diagnostics', () => {
    console.log('\nPOSITION | N | CLOSEST PAIR | CORRELATION | DISTANCE | MAX OVR GAP');
    for (const position of PLAYER_POSITIONS) {
      const archetypes = getEligibleFootballArchetypes(position);
      const rows = archetypes.map((archetype) => {
        const totals = attributeKeys.map(() => 0),
          ovrs: number[] = [];
        for (let n = 0; n < 1000; n++) {
          const p = generateStartingPlayerProfile(
            input(position, 'normal', `audit-${n}`),
            `audit-${n}`,
            archetype.id,
          ).player;
          attributeKeys.forEach((k, i) => (totals[i]! += p.attributes[k]));
          ovrs.push(getTheoreticalPositionOverall(p, position));
        }
        return {
          archetype,
          centroid: totals.map((x) => x / 1000),
          ovr: ovrs.reduce((a, b) => a + b) / 1000,
        };
      });
      let closest = { a: '', b: '', corr: -Infinity, distance: Infinity };
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i]!,
            b = rows[j]!,
            corr = correlation(a.centroid, b.centroid),
            distance =
              Math.sqrt(
                a.centroid.reduce((s, x, k) => s + (x - b.centroid[k]!) ** 2, 0) /
                  attributeKeys.length,
              ) / 100;
          if (distance < closest.distance)
            closest = { a: a.archetype.label, b: b.archetype.label, corr, distance };
        }
      const gap = Math.max(...rows.map((r) => r.ovr)) - Math.min(...rows.map((r) => r.ovr));
      console.log(
        `${position} | ${rows.length} | ${closest.a} / ${closest.b} | ${closest.corr.toFixed(3)} | ${closest.distance.toFixed(3)} | ${gap.toFixed(2)}`,
      );
      for (const row of rows)
        console.log(
          `  ${row.archetype.label}: OVR ${row.ovr.toFixed(2)}; profile ${row.centroid.map((x) => x.toFixed(1)).join(',')}`,
        );
    }
    console.log('\nDIFFICULTY | OVERALL MEAN | GK MEAN | GK DELTA');
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
      const all: number[] = [],
        gk: number[] = [];
      for (const position of PLAYER_POSITIONS)
        for (let n = 0; n < 100; n++) {
          const archetype =
            getEligibleFootballArchetypes(position)[
              n % getEligibleFootballArchetypes(position).length
            ]!;
          const p = generateStartingPlayerProfile(
            input(position, difficulty, `balance-${n}`),
            `balance-${n}`,
            archetype.id,
          ).player;
          const value = getTheoreticalPositionOverall(p, position);
          all.push(value);
          if (position === 'goalkeeper') gk.push(value);
        }
      const mean = (x: number[]) => x.reduce((a, b) => a + b) / x.length;
      console.log(
        `${difficulty} | ${mean(all).toFixed(2)} | ${mean(gk).toFixed(2)} | ${(mean(gk) - mean(all)).toFixed(2)}`,
      );
    }
  }, 120_000);

  it('preserves broad positional identity and archetype exceptions', () => {
    const average = (
      position: PlayerPosition,
      archetypeId: string,
      attribute: (typeof attributeKeys)[number],
    ) => {
      const values = Array.from(
        { length: 200 },
        (_, n) =>
          generateStartingPlayerProfile(
            input(position, 'normal', `identity-${n}`),
            `identity-${n}`,
            archetypeId,
          ).player.attributes[attribute],
      );
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    expect(average('striker', 'poacher', 'tackling')).toBeLessThan(
      average('center_back', 'center_back_classic', 'tackling') - 15,
    );
    expect(average('center_back', 'center_back_classic', 'finishing')).toBeLessThan(
      average('striker', 'poacher', 'finishing') - 15,
    );
    expect(average('striker', 'pressing_forward', 'tackling')).toBeGreaterThan(
      average('striker', 'poacher', 'tackling') + 8,
    );
    expect(average('striker', 'false_nine', 'passing')).toBeGreaterThan(
      average('striker', 'target_man', 'passing') + 5,
    );
  });
});
