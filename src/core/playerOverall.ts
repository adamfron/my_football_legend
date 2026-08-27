import type {
  GoalkeeperAttributes,
  Player,
  PlayerAttributes,
  PlayerPosition,
} from '../types/domain';

const weights: Record<PlayerPosition, Partial<Record<keyof PlayerAttributes, number>>> = {
  goalkeeper: {},
  center_back: {
    defending: 0.3,
    spatialAwareness: 0.2,
    composure: 0.18,
    stamina: 0.14,
    technique: 0.1,
    pace: 0.08,
  },
  full_back: { pace: 0.27, stamina: 0.25, defending: 0.22, technique: 0.16, vision: 0.1 },
  defensive_midfielder: {
    defending: 0.22,
    spatialAwareness: 0.18,
    vision: 0.18,
    composure: 0.2,
    stamina: 0.18,
    technique: 0.12,
  },
  central_midfielder: {
    vision: 0.24,
    technique: 0.22,
    spatialAwareness: 0.18,
    stamina: 0.18,
    composure: 0.12,
    defending: 0.06,
  },
  attacking_midfielder: {
    vision: 0.28,
    technique: 0.27,
    composure: 0.2,
    finishing: 0.17,
    pace: 0.08,
  },
  winger: { pace: 0.3, technique: 0.27, finishing: 0.2, vision: 0.15, stamina: 0.08 },
  striker: {
    finishing: 0.28,
    composure: 0.2,
    spatialAwareness: 0.18,
    pace: 0.16,
    technique: 0.13,
    vision: 0.05,
  },
};

/** Player-facing positional summary only; selection continues to use detailed attributes. */
export const getPlayerOverall = (player: Player, position: PlayerPosition | string): number => {
  if (position === 'goalkeeper' && player.goalkeeperAttributes) {
    const goalkeeperWeights: Record<keyof GoalkeeperAttributes, number> = {
      reflexes: 0.22,
      goalkeeperPositioning: 0.2,
      handling: 0.18,
      oneOnOnes: 0.16,
      aerialCommand: 0.09,
      communication: 0.07,
      distribution: 0.08,
    };
    const specialist = Object.entries(goalkeeperWeights).reduce(
      (sum, [key, weight]) =>
        sum + player.goalkeeperAttributes![key as keyof GoalkeeperAttributes] * weight,
      0,
    );
    // Finishing deliberately has no goalkeeper weight; awareness/composure are useful secondary skills.
    const value =
      specialist * 0.86 +
      player.attributes.spatialAwareness * 0.07 +
      player.attributes.composure * 0.07;
    return Math.max(1, Math.min(100, Math.round(value)));
  }
  const profile = weights[position as PlayerPosition] ?? weights.central_midfielder;
  const value = Object.entries(profile).reduce(
    (sum, [attribute, weight]) =>
      sum + player.attributes[attribute as keyof PlayerAttributes] * weight,
    0,
  );
  return Math.max(1, Math.min(100, Math.round(value)));
};
