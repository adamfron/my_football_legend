import { z } from 'zod';
import { projectFutureBallTrajectory } from './ballPhysics';
import { distance, pitchPointSchema } from './matchSpace';
import type { TacticalMatchState } from './matchState';
import { estimatePlayerArrivalTime } from './playerArrival';
import { deriveMovementCapability } from './locomotion';
import { isMatchGoalkeeper } from './matchGoalkeeper';
import { canParticipatePhysically } from './matchInjuries';
import { canContactAfterThrowIn } from './throwIn';

export const aerialAssignmentSchema = z.object({
  playerId: z.string(),
  team: z.enum(['home', 'away']),
  target: pitchPointSchema,
  contactIn: z.number().positive(),
  arrivalIn: z.number().nonnegative(),
  height: z.number().nonnegative(),
  intention: z.enum(['challenge', 'second_ball']),
});
export type AerialAssignment = z.infer<typeof aerialAssignmentSchema>;

/** One shared canonical flight, at most three detailed arrival checks per body, on the
 * tactical cadence. Neither intended receiver identity nor nominal target grants priority. */
export const deriveAerialAssignments = (state: TacticalMatchState): AerialAssignment[] => {
  const ball = state.ball;
  if (ball.ownerId || !ball.velocity || !ball.airborne || state.restart?.phase === 'setup')
    return [];
  const samples = projectFutureBallTrajectory(
    {
      position: { x: ball.x, y: ball.y, z: ball.height ?? 0.11 },
      velocity: { x: ball.velocity.x, y: ball.velocity.y, z: ball.velocity.z ?? 0 },
      airborne: true,
      bounceCount: ball.bounceCount ?? 0,
      ...(ball.spin ? { spin: ball.spin } : {}),
    },
    3,
    0.15,
  ).filter(
    (s) =>
      s.ball.position.x >= 0.4 &&
      s.ball.position.x <= 104.6 &&
      s.ball.position.y >= 0.4 &&
      s.ball.position.y <= 67.6,
  );
  const candidates = state.players.flatMap((player): AerialAssignment[] => {
    if (
      isMatchGoalkeeper(player) ||
      !canParticipatePhysically(player) ||
      state.discipline?.[player.id]?.sentOff ||
      !canContactAfterThrowIn(state, player.id)
    )
      return [];
    const reach = player.profile.heightCm / 100 + 0.18 + player.profile.attributes.jumping * 0.004;
    const speed = deriveMovementCapability(player).maximumSprintSpeed;
    // A nominated run-on receiver may deliberately meet a pass at the feet. Preserve
    // PR180's low-control preparation; opponents still attack earlier aerial samples.
    const prefersControl =
      ball.intendedReceiverId === player.id &&
      state.receptionPreparation?.actorId === player.id &&
      ['pass', 'through_ball', 'long_distribution'].includes(ball.travelKind ?? '');
    const possible = samples.filter(
      (s) =>
        s.ball.position.z <= reach &&
        (!prefersControl || s.ball.position.z <= 0.65) &&
        s.ball.velocity.z <= 1 &&
        distance(player.position, s.ball.position) <= speed * s.at + 0.8,
    );
    const probes = [
      ...new Set([possible[0], possible[Math.floor(possible.length / 2)], possible.at(-1)]),
    ].filter((s) => s !== undefined);
    for (const sample of probes) {
      const target = { x: sample.ball.position.x, y: sample.ball.position.y };
      const arrivalIn = estimatePlayerArrivalTime(state, player, target, 'intercept').estimatedTime;
      if (arrivalIn > sample.at + 0.12) continue;
      return [
        {
          playerId: player.id,
          team: player.team,
          target,
          contactIn: sample.at,
          arrivalIn,
          height: sample.ball.position.z,
          intention: sample.ball.position.z >= 0.65 ? 'challenge' : 'second_ball',
        },
      ];
    }
    return [];
  });
  return (['home', 'away'] as const).flatMap((side) =>
    candidates
      .filter((c) => c.team === side)
      .sort(
        (a, b) =>
          a.contactIn - b.contactIn ||
          a.arrivalIn - b.arrivalIn ||
          a.playerId.localeCompare(b.playerId),
      )
      .slice(0, 2),
  );
};
