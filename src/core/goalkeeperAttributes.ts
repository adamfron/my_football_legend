import type { GoalkeeperAttributes, PlayerAttributes } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

export const goalkeeperAttributeLabels: Record<keyof GoalkeeperAttributes, string> = {
  reflexes: 'Refleks',
  handling: 'Chwyt',
  oneOnOnes: 'Gra 1 na 1',
  goalkeeperPositioning: 'Ustawienie',
  aerialCommand: 'Gra na przedpolu',
  distribution: 'Dystrybucja',
  communication: 'Komunikacja',
};

const clamp = (value: number) => Math.max(1, Math.min(100, Math.round(value)));

/** Stable derivation used by both the creator and legacy-save migration. */
export const deriveGoalkeeperAttributes = (
  seed: string,
  generic: PlayerAttributes,
  age: number,
  targetOverall?: number,
): GoalkeeperAttributes => {
  const rng = RandomGenerator.fromSeed(`${seed}:goalkeeper-attributes`);
  const base =
    targetOverall ?? (generic.composure + generic.spatialAwareness + generic.defending) / 3;
  const experience = Math.max(0, Math.min(8, (age - 18) * 0.35));
  const roll = (bias = 0) => clamp(base + bias + rng.int(-7, 7));
  return {
    reflexes: roll(3 - Math.max(0, age - 34) * 0.7),
    handling: roll(),
    oneOnOnes: roll(1),
    goalkeeperPositioning: roll(experience),
    aerialCommand: roll((generic.spatialAwareness - 50) * 0.12),
    distribution: roll((generic.technique + generic.vision - 100) * 0.12),
    communication: roll(experience + (generic.leadership - 50) * 0.12),
  };
};
