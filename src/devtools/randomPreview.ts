import { RandomGenerator } from '../core/random/RandomGenerator';
export const previewRandomSequence = (seed: string) => {
  const rng = RandomGenerator.fromSeed(seed);
  return { float: rng.float(), int: rng.int(1, 20), bool: rng.bool(0.35), pick: rng.pick(['spokój','ryzyko','cierpliwość']), weighted: rng.weighted([{ item: 'bezpiecznie', weight: 3 }, { item: 'odważnie', weight: 1 }]), shuffled: rng.shuffle(['A','B','C','D']).join('') };
};
