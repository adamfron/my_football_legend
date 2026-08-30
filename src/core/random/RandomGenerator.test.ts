import { describe, expect, it } from 'vitest';
import { RandomGenerator } from './RandomGenerator';

describe('RandomGenerator', () => {
  it('returns the same sequence for the same seed', () => {
    const a = RandomGenerator.fromSeed('career');
    const b = RandomGenerator.fromSeed('career');
    expect([a.float(), a.int(1, 10), a.bool(0.4), a.pick(['x', 'y'])]).toEqual([
      b.float(),
      b.int(1, 10),
      b.bool(0.4),
      b.pick(['x', 'y']),
    ]);
  });
  it('exports and imports state', () => {
    const rng = RandomGenerator.fromSeed('save');
    rng.float();
    const restored = RandomGenerator.import(rng.export());
    expect(restored.float()).toBe(rng.float());
  });
  it('supports weighted picks, shuffling and independent forks', () => {
    const rng = RandomGenerator.fromSeed('tools');
    expect(
      rng.weighted([
        { item: 'a', weight: 0 },
        { item: 'b', weight: 2 },
      ]),
    ).toBe('b');
    expect(rng.shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
    expect(RandomGenerator.fromSeed('tools').fork('child').float()).toBe(
      RandomGenerator.fromSeed('tools').fork('child').float(),
    );
  });
});
