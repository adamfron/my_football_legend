import type { PlayerAttributes } from '../types/domain';
/** Derived presentation metrics; canonical goalkeeper skills live in PlayerAttributes. */
export const deriveGoalkeeperMetrics = (a: PlayerAttributes, heightCm: number) => ({
  positioning: (a.gameReading + a.concentration + a.composure + a.goalkeeperSweeping) / 4,
  distribution: (a.passing + a.technique + a.firstTouch + a.gameReading) / 4,
  communication: (a.leadership + a.gameReading + a.composure) / 3,
  aerialCommand:
    (a.handling +
      a.goalkeeperSweeping +
      a.jumping +
      a.strength +
      Math.max(1, Math.min(100, (heightCm - 150) * 1.6))) /
    5,
});
