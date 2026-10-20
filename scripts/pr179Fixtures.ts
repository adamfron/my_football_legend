import { z } from 'zod';
import { pr167World } from './pr167Fixtures';
import { PR175_DESIGNS, createPr175Fixture, pr175DesignSchema } from './pr175Fixtures';
import { selectBestXI, selectMatchBench } from '../src/core/footballerWorld';

export const pr179FixtureDesignSchema = pr175DesignSchema.extend({
  tier: z.enum(['SS', 'SW', 'WW']),
  strength: z.tuple([z.number(), z.number()]),
});
/** Pre-match native population: effective XI already accounts for position/duty fit.
 * Fitness and injury availability enter the canonical selector. The current research world
 * is fresh and healthy, so these are equal conditions, not invented strength adjustments. */
export const pr179Population = pr167World.clubs
  .filter((c) => c.id.startsWith('pro_'))
  .map((club) => {
    const world = { footballerWorld: pr167World.footballers };
    const xi = selectBestXI(world, club, '4-3-3');
    const bench = selectMatchBench(world, club, xi.assignments, 7);
    const startingXI = xi.assignments.reduce((s, a) => s + a.effectiveOverall, 0) / 11;
    const depth = bench.reduce((s, a) => s + a.effectiveOverall, 0) / Math.max(1, bench.length);
    return { clubId: club.id, startingXI, depth, strength: startingXI * 0.85 + depth * 0.15 };
  })
  .sort((a, b) => b.strength - a.strength || a.clubId.localeCompare(b.clubId));
const n = pr179Population.length;
const strong = pr179Population.slice(0, Math.floor(n / 4));
const weak = pr179Population.slice(-Math.floor(n / 4));
const rows = [
  ['SS', 0, 2, '4-3-3', '4-2-3-1', 'possession', 'pressing'],
  ['SS', 3, 5, '3-5-2', '4-4-2', 'direct', 'balanced'],
  ['SW', 1, 1, '4-2-3-1', '3-4-2-1', 'possession', 'counter_attacking'],
  ['SW', 4, 4, '3-4-2-1', '4-4-2', 'pressing', 'direct'],
  ['WW', 0, 2, '4-4-2', '4-3-3', 'direct', 'counter_attacking'],
  ['WW', 3, 5, '3-5-2', '4-2-3-1', 'balanced', 'pressing'],
] as const;
export const PR179_DESIGNS = rows.map(
  ([tier, a, b, homeFormation, awayFormation, homeStyle, awayStyle], i) => {
    const home = (tier === 'WW' ? weak : strong)[a]!,
      away = (tier === 'SS' ? strong : weak)[b]!;
    const id = `pr179-dev-${tier.toLowerCase()}-${(i % 2) + 1}`;
    return pr179FixtureDesignSchema.parse({
      id,
      split: 'development',
      seed: `pr179-20261020-v1:${id}`,
      tier,
      strength: [home.strength, away.strength],
      youth: false,
      clubs: [home.clubId, away.clubId],
      formations: [homeFormation, awayFormation],
      styles: [homeStyle, awayStyle],
      attributes: 'native',
    });
  },
);
/** These twelve designs may be materialised and hashed, never simulated in PR179. */
export const PR180_RESERVED = Array.from({ length: 12 }, (_, i) => {
  const tier = (['SS', 'SW', 'WW'] as const)[Math.floor(i / 4)]!;
  const a = 6 + (i % 4),
    b = 10 + (i % 4);
  const home = (tier === 'WW' ? weak : strong)[a % strong.length]!,
    away = (tier === 'SS' ? strong : weak)[b % weak.length]!;
  const formations = ['4-3-3', '4-4-2', '3-5-2', '3-4-2-1', '4-2-3-1'];
  const styles = ['balanced', 'pressing', 'direct', 'possession', 'counter_attacking'];
  const id = `pr180-reserved-${tier.toLowerCase()}-${(i % 4) + 1}`;
  return pr179FixtureDesignSchema.parse({
    id,
    split: 'validation',
    seed: `pr180-unopened-20261020-v1:${id}`,
    tier,
    strength: [home.strength, away.strength],
    youth: false,
    clubs: [home.clubId, away.clubId],
    formations: [formations[i % 5], formations[(i + 2) % 5]],
    styles: [styles[i % 5], styles[(i + 3) % 5]],
    attributes: 'native',
  });
});
export const createPr179Fixture = (design: z.infer<typeof pr179FixtureDesignSchema>) => {
  if (!PR175_DESIGNS.some((d) => d.id === design.id))
    PR175_DESIGNS.push(pr175DesignSchema.parse(design));
  return createPr175Fixture(design.id);
};
