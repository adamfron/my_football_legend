import type { EffortLevel } from '../types/domain';

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
