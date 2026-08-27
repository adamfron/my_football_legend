import type { EffortLevel, PlayerAttributes } from '../types/domain';
import { RandomGenerator } from './random/RandomGenerator';

export const MATCH_EFFORT_LABELS: Record<EffortLevel, string> = {
  1: 'Lepiej mądrze stać niż głupio biegać',
  2: 'Oszczędzaj siły',
  3: 'Normalne zaangażowanie',
  4: 'Gryź trawę',
  5: 'Gotów umrzeć na boisku',
};
export const TRAINING_EFFORT_LABELS: Record<EffortLevel, string> = {
  1: 'Regeneracja to klucz do sukcesu',
  2: 'Lekki trening',
  3: 'Standardowy plan',
  4: 'Zostaję po treningu',
  5: 'Klub nie potrzebuje już dozorcy',
};

export const getMatchEffortEffects = (level: EffortLevel) => ({
  performanceModifier: (level - 3) * 0.12,
  fitnessCostMultiplier: 0.7 + level * 0.15,
  overloadRisk: level * level * 0.002,
});
export const getTrainingEffortEffects = (level: EffortLevel) => ({
  developmentStimulus: 0.55 + level * 0.15,
  weeklyRecovery: 16 - level * 2,
  fatigue: level * 2,
  overloadRisk: level * level * 0.0015,
});

const effortLevel = (score: number): EffortLevel =>
  Math.max(1, Math.min(5, Math.round(1 + score / 25))) as EffortLevel;

/** Personality establishes a habit; seeded variance prevents identical personalities being clones. */
export const deriveInitialEffort = (seed: string, attributes: PlayerAttributes) => {
  const variance = (kind: string) => RandomGenerator.fromSeed(`${seed}:effort:${kind}`).int(-7, 7);
  return {
    trainingEffort: effortLevel(
      attributes.professionalism * 0.5 +
        attributes.determination * 0.3 +
        attributes.ambition * 0.2 +
        variance('training'),
    ),
    matchEffort: effortLevel(
      attributes.determination * 0.5 +
        attributes.ambition * 0.3 +
        attributes.professionalism * 0.2 +
        variance('match'),
    ),
  };
};

export const changeEffortTendency = (level: EffortLevel, delta: -1 | 0 | 1): EffortLevel =>
  Math.max(1, Math.min(5, level + delta)) as EffortLevel;

export const effectiveMatchEffort = (base: EffortLevel, temporaryModifier = 0): EffortLevel =>
  Math.max(1, Math.min(5, base + temporaryModifier)) as EffortLevel;
