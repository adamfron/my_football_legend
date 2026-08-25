import type { Player, PlayerAttributes, PlayerPosition } from '../types/domain';

const weights: Record<PlayerPosition, Partial<Record<keyof PlayerAttributes, number>>> = {
  goalkeeper: { composure: 0.32, vision: 0.28, technique: 0.16, leadership: 0.14, pace: 0.1 },
  center_back: { defending: 0.35, composure: 0.23, stamina: 0.17, technique: 0.15, pace: 0.1 },
  full_back: { pace: 0.27, stamina: 0.25, defending: 0.22, technique: 0.16, vision: 0.1 },
  defensive_midfielder: {
    defending: 0.25,
    vision: 0.22,
    composure: 0.2,
    stamina: 0.18,
    technique: 0.15,
  },
  central_midfielder: {
    vision: 0.28,
    technique: 0.26,
    stamina: 0.22,
    composure: 0.16,
    defending: 0.08,
  },
  attacking_midfielder: {
    vision: 0.28,
    technique: 0.27,
    composure: 0.2,
    finishing: 0.17,
    pace: 0.08,
  },
  winger: { pace: 0.3, technique: 0.27, finishing: 0.2, vision: 0.15, stamina: 0.08 },
  striker: { finishing: 0.34, composure: 0.26, pace: 0.2, technique: 0.14, vision: 0.06 },
};

/** Player-facing positional summary only; selection continues to use detailed attributes. */
export const getPlayerOverall = (player: Player, position: PlayerPosition | string): number => {
  const profile = weights[position as PlayerPosition] ?? weights.central_midfielder;
  const value = Object.entries(profile).reduce(
    (sum, [attribute, weight]) =>
      sum + player.attributes[attribute as keyof PlayerAttributes] * weight,
    0,
  );
  return Math.max(1, Math.min(100, Math.round(value)));
};
