import { z } from 'zod';
import { projectFutureBallTrajectory, type PhysicalBallForecastSample } from './ballPhysics';
import { advanceVerticalJump } from './bodyMechanics';
import { estimatePlayerArrivalTime } from './playerArrival';
import { estimateUsefulContact } from './opportunityWindows';
import { deriveMovementCapability } from './locomotion';
import { distance, physicalPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import type { PassLaunchPlan } from './passLaunchPlan';

export const passInterventionSchema = z.object({
  playerId: z.string(),
  spatialMargin: z.number(),
  reachableMargin: z.number().nullable(),
  contactAt: z.number().nullable(),
  height: z.number().nullable(),
  point: physicalPointSchema.nullable(),
  surface: z.enum(['foot', 'aerial_envelope']).nullable(),
  scheduledJump: z.boolean(),
  detailedProbes: z.number().int().min(0).max(3),
});
export type PassIntervention = z.infer<typeof passInterventionSchema>;

/** Canonical 25 ms flight, sampled for at most three detailed movement checks per opponent.
 * This is privileged engineering geometry, never a control/retention probability or ownership.
 * The legacy standing aerial envelope is explicitly approximate; an existing jump is advanced,
 * while no new takeoff is assumed. Unsupported thigh/chest control is never labelled foot contact.
 */
export const forecastPassInterventions = (
  state: TacticalMatchState,
  passer: MatchPlayerState,
  plan: PassLaunchPlan,
): PassIntervention[] => {
  const origin = state.ball.ownerId === passer.id ? state.ball : passer.position;
  const trajectory = projectFutureBallTrajectory(
    {
      position: { x: origin.x, y: origin.y, z: Math.max(0.11, state.ball.height ?? 0.11) },
      velocity: plan.velocity,
      airborne: plan.elevation > 0,
      bounceCount: 0,
    },
    Math.min(6, plan.predictedArrivalTime + 0.25),
    0.025,
    state.ballEnvironment,
  );
  // A physical trajectory may leave the pitch. It cannot become an in-play ETA target;
  // stop at its first exit instead of clipping the ball or weakening pitch validation.
  const exit = trajectory.findIndex(
    (s) =>
      s.ball.position.x < 0 ||
      s.ball.position.x > 105 ||
      s.ball.position.y < 0 ||
      s.ball.position.y > 68,
  );
  const samples = (exit < 0 ? trajectory : trajectory.slice(0, exit)).filter(
    (s, i) => i % 4 === 3 || s.at >= plan.predictedArrivalTime,
  );
  return state.players
    .filter((p) => p.team !== passer.team)
    .map((player) => {
      const capability = deriveMovementCapability(player);
      const rank = (s: PhysicalBallForecastSample) =>
        estimateUsefulContact(
          {
            position: player.position,
            velocity: player.velocity,
            facing: player.facingAngle,
          },
          s.ball.position,
          capability.maximumSprintSpeed,
          capability.acceleration,
          0,
          0,
        ).playableSeconds - s.at;
      const ranked = samples
        .map((sample) => ({ sample, margin: rank(sample) }))
        .sort((a, b) => a.margin - b.margin);
      const eligible = ranked
        .filter(({ sample }) => {
          const z = sample.ball.position.z;
          const jump = player.verticalJump
            ? advanceVerticalJump(player.verticalJump, sample.at)
            : undefined;
          const top = jump
            ? player.profile.heightCm / 100 + jump.height + 0.11
            : player.profile.heightCm / 100 + 0.18 + player.profile.attributes.jumping * 0.004;
          const bottom = jump
            ? Math.max(1.45, player.profile.heightCm / 100 + jump.height - 0.35)
            : 1.45;
          return z <= 0.65 || (z >= bottom && z <= top);
        })
        .slice(0, 3);
      let best: { sample: PhysicalBallForecastSample; margin: number } | undefined;
      for (const { sample } of eligible) {
        const lower =
          Math.max(0, distance(player.position, sample.ball.position) - 0.8) /
          Math.max(capability.maximumSprintSpeed, Math.hypot(player.velocity.x, player.velocity.y));
        if (lower > sample.at + 0.18) continue;
        const eta = estimatePlayerArrivalTime(
          state,
          player,
          sample.ball.position,
          'intercept',
        ).estimatedTime;
        const margin = eta - sample.at;
        if (!best || margin < best.margin) best = { sample, margin };
      }
      return {
        playerId: player.id,
        spatialMargin: ranked[0]?.margin ?? 99,
        reachableMargin: best?.margin ?? null,
        contactAt: best?.sample.at ?? null,
        height: best?.sample.ball.position.z ?? null,
        point: best ? { x: best.sample.ball.position.x, y: best.sample.ball.position.y } : null,
        surface: best
          ? best.sample.ball.position.z <= 0.65
            ? ('foot' as const)
            : ('aerial_envelope' as const)
          : null,
        scheduledJump: !!player.verticalJump && player.verticalJump.phase !== 'ready',
        detailedProbes: eligible.length,
      };
    });
};
