import type { FootballerProfile, PlayerAttributes } from '../src/types/domain';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';

/** A real canonical player card, copied and neutralised; never edits the world or career. */
export const createFootballLabProfile = (): FootballerProfile => {
  const world = createCanonicalWorldDatabase();
  const session = createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed: 'pr184-profile',
    control: { mode: 'spectator' },
  });
  const player = structuredClone(
    session.home.players.find((p) => p.slot.position === 'central_midfielder')!.profile,
  );
  player.attributes = Object.fromEntries(
    Object.keys(player.attributes).map((a) => [a, 60]),
  ) as unknown as PlayerAttributes;
  player.dominantFoot = 'right';
  player.weakFootProficiency = 40;
  player.traits = [];
  player.heightCm = 180;
  player.weightKg = 75;
  return player;
};
