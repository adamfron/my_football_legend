import type { BoundedScene } from './boundedPerception';
import { knownBoundedPlayers } from './boundedPerception';
import type { MatchAction } from './matchState';
import { passLaunchPlanSchema } from './passLaunchPlan';
import { BALL_PHYSICS, deriveLaunchVelocity, deriveAerialLaunchPlan } from './ballPhysics';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { distance } from './matchSpace';

/** Freeze the intended ray from permitted evidence. The older canonical support
 * planner otherwise silently retargets the real current receiver at execution.
 * This closed-form rolling estimate is not a future-world rollout. Unknown receiver
 * readiness uses a common envelope; actual first touch still uses that player's body. */
export const observedPassDelivery = (
  s: BoundedScene,
  action: MatchAction,
  travelSeconds: number,
): MatchAction => {
  if (action.type !== 'pass' || !s.ball || !s.knowledge) return action;
  const receiver = knownBoundedPlayers(s).find(
    (p) => p.id === action.receiverId && p.team === s.team,
  );
  if (!receiver) return action;
  const origin = s.ball.position,
    metres = distance(origin, action.target);
  const time = Math.max(0.48, Math.min(2.2, travelSeconds));
  const speed = Math.min(
    30,
    Math.max(3.2, metres / time + BALL_PHYSICS.rollingDeceleration * time * 0.5),
  );
  const loft =
    s.observedLoftedExperiment && action.delivery === 'lofted'
      ? deriveAerialLaunchPlan(origin, action.target, 'pass', {
          releaseHeight: Math.max(0.11, s.ball.height),
          maximumSpeed: 30,
          ability: (s.attributes.passing + s.attributes.technique) / 2,
        })
      : undefined;
  const velocity = loft?.velocity ?? deriveLaunchVelocity(origin, action.target, speed, 0);
  const incoming = angleForVector({
    x: origin.x - receiver.position.x,
    y: origin.y - receiver.position.y,
  });
  const orientationTime =
    receiver.facing === undefined
      ? 0.4
      : Math.abs(normalizeAngle(incoming - receiver.facing)) / 3.15;
  const movementTime =
    distance(receiver.position, action.target) /
    Math.max(2.4, Math.min(7, Math.hypot(receiver.velocity.x, receiver.velocity.y) + 3));
  const readyAt = 0.3 + Math.max(orientationTime, movementTime);
  return {
    ...action,
    receiverPositionAtSelection: { ...receiver.position },
    receiverVelocityAtSelection: { ...receiver.velocity },
    deliveryPlan: passLaunchPlanSchema.parse({
      target: action.target,
      velocity,
      speed: loft?.speed ?? speed,
      elevation: loft?.elevation ?? 0,
      predictedArrivalTime: loft?.predictedFlightTime ?? time,
      predictedArrivalSpeed: loft
        ? Math.hypot(velocity.x, velocity.y)
        : Math.max(0, speed - BALL_PHYSICS.rollingDeceleration * time),
      receiverReadiness: {
        contactPoint: action.target,
        awareAt: 0.3,
        readyAt,
        earliestUsefulContactTime: readyAt + 0.12,
        preferredArrivalSpeed: 5.5,
        maximumComfortableArrivalSpeed: 10,
        preparationMargin: (loft?.predictedFlightTime ?? time) - readyAt,
        movementTime,
        orientationTime,
      },
    }),
  };
};
