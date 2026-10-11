import { z } from 'zod';
import {
  clampPitchPoint,
  distance,
  signedForwardDistance,
  pitchPointSchema,
  type PitchPoint,
} from './matchSpace';
import type {
  BallMovementMode,
  MatchAction,
  MatchPlayerState,
  TacticalMatchState,
} from './matchState';
import { estimatePlayerArrivalTime } from './playerArrival';
import { earliestDefenderArrival } from './passDecision';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveMovementCapability } from './locomotion';

export const carryOpportunitySchema = z.object({
  target: pitchPointSchema,
  freeDistance: z.number().nonnegative(),
  carrierEta: z.number().nonnegative(),
  defenderEta: z.number().nonnegative(),
  recoveryMargin: z.number().finite(),
  crossingAccess: z.number().min(0).max(1),
  support: z.number().int().nonnegative(),
  turnCost: z.number().nonnegative(),
});

/** At most six waypoints on one corridor. Shared arrival estimates include acceleration,
 * velocity, turning and reserves. This is a forecast, never ownership or movement authority. */
export const projectCarryOpportunity = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  target: PitchPoint,
  mode: BallMovementMode = 'carry',
) => {
  const metres = distance(actor.position, target);
  const direction = {
    x: (target.x - actor.position.x) / Math.max(0.01, metres),
    y: (target.y - actor.position.y) / Math.max(0.01, metres),
  };
  const defenders = state.players.filter((p) => p.team !== actor.team);
  const forecast: TacticalMatchState = {
    ...state,
    ball:
      state.ball.ownerId === actor.id
        ? state.ball
        : {
            x: actor.position.x,
            y: actor.position.y,
            ownerId: actor.id,
            velocity: { ...actor.velocity },
            height: 0.11,
          },
    ballCarrierIntent: {
      actorId: actor.id,
      type: 'carry',
      target,
      startedAt: state.time,
      expiresAt: state.time + 8,
      estimatedArrival: 0,
      startPosition: actor.position,
      closestPointReached: actor.position,
      humanSelected: false,
      movementMode: mode,
      executionMode: mode === 'sprint' ? 'burst' : 'controlled',
    },
  };
  delete forecast.receptionPreparation;
  delete forecast.playerMovementIntent;
  if (forecast.controlledBallContact?.actorId !== actor.id) delete forecast.controlledBallContact;
  let freeDistance = 0,
    carrierEta = 0,
    defenderEta = 99;
  const samples = Math.min(6, Math.max(1, Math.ceil(metres / 5)));
  for (let i = 1; i <= samples; i++) {
    const step = (metres * i) / samples;
    const point = clampPitchPoint({
      x: actor.position.x + direction.x * step,
      y: actor.position.y + direction.y * step,
    });
    const arrival = estimatePlayerArrivalTime(forecast, actor, point).estimatedTime;
    const defensiveArrival = earliestDefenderArrival(state, defenders, point);
    // The ball pushed ahead is exposed before the body arrives. Sprint needs more margin.
    if (defensiveArrival < arrival + (mode === 'sprint' ? 0.22 : 0.1)) break;
    freeDistance = step;
    carrierEta = arrival;
    defenderEta = defensiveArrival;
  }
  const end = clampPitchPoint({
    x: actor.position.x + direction.x * freeDistance,
    y: actor.position.y + direction.y * freeDistance,
  });
  const depth = actor.team === 'home' ? end.x : 105 - end.x;
  const wide = Math.abs(end.y - 34) >= 15;
  const support = state.players.filter(
    (p) =>
      p.team === actor.team &&
      p.id !== actor.id &&
      (actor.team === 'home' ? p.position.x : 105 - p.position.x) > 65 &&
      Math.abs(p.position.y - 34) < 23,
  ).length;
  return carryOpportunitySchema.parse({
    target: end,
    freeDistance,
    carrierEta,
    defenderEta,
    recoveryMargin: defenderEta - carrierEta,
    crossingAccess: wide && support > 0 ? Math.max(0, Math.min(1, (depth - 65) / 25)) : 0,
    support,
    turnCost: Math.abs(normalizeAngle(angleForVector(direction) - actor.facingAngle)) / Math.PI,
  });
};

/** Three contextual corridors, plus existing short/cautious options. No role bonus or grid. */
export const enumerateCarryChoices = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): MatchAction[] => {
  const dir = actor.team === 'home' ? 1 : -1;
  const actions: MatchAction[] = [
    {
      type: 'carry',
      actorId: actor.id,
      target: clampPitchPoint({ x: actor.position.x + dir * 6, y: actor.position.y }),
    },
    {
      type: 'carry',
      actorId: actor.id,
      target: clampPitchPoint({
        x: actor.position.x + dir * 10,
        y: actor.position.y + (34 - actor.position.y) * 0.35,
      }),
    },
    {
      type: 'carry',
      actorId: actor.id,
      target: clampPitchPoint({
        x: actor.position.x + dir * 5,
        y: actor.position.y + (actor.position.y < 34 ? -5 : 5),
      }),
    },
    {
      type: 'carry',
      actorId: actor.id,
      target: clampPitchPoint({
        x: actor.position.x - dir * 3,
        y: actor.position.y + (34 - actor.position.y) * 0.25,
      }),
    },
  ];
  const readiness = actor.fitness?.burstReadiness ?? 1;
  if (readiness < 0.35) return actions;
  const range = Math.min(30, 15 + deriveMovementCapability(actor).maximumSprintSpeed * 1.5);
  for (const lateral of [0, (34 - actor.position.y) * 0.22, actor.position.y < 34 ? -4 : 4]) {
    const target = clampPitchPoint({
      x: actor.position.x + dir * range,
      y: actor.position.y + lateral,
    });
    const opportunity = projectCarryOpportunity(state, actor, target, 'sprint');
    if (
      opportunity.freeDistance >= 12 &&
      signedForwardDistance(actor.position, opportunity.target, actor.team) > 8
    )
      actions.push({
        type: 'carry',
        actorId: actor.id,
        target: opportunity.target,
        movementMode: 'sprint',
      });
  }
  return actions;
};
