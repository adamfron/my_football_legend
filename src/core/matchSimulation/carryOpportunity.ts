import { attacksRight } from './matchSpace';
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
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveMovementCapability } from './locomotion';
import { deriveFitnessPhysicalModifiers } from './matchFitness';
import { canParticipatePhysically } from './matchInjuries';

/** Momentum is already integrated by the common arrival solver. A body initially
 * facing away also needs to turn; live locomotion applies the same angular envelope. */
export const carryRaceArrival = (
  state: TacticalMatchState,
  player: MatchPlayerState,
  target: PitchPoint,
) => {
  const arrival = estimatePlayerArrivalTime(state, player, target, 'intercept');
  const angle = Math.abs(
    normalizeAngle(
      angleForVector({ x: target.x - player.position.x, y: target.y - player.position.y }) -
        player.facingAngle,
    ),
  );
  const angularRate =
    (2.2 + player.profile.attributes.agility * 0.038) *
    Math.max(0.38, 1 - Math.hypot(player.velocity.x, player.velocity.y) / 13) *
    deriveFitnessPhysicalModifiers(player).turning;
  // The player can shuffle/backpedal while turning, so only the lost forward progress
  // contributes a delay. This forecast never changes physical speed or grants contact.
  const turningDelay = (Math.max(0, angle - Math.PI / 3) / angularRate) * 0.48;
  return arrival.estimatedTime + turningDelay;
};

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
  const defenders = state.players.filter(
    (p) =>
      p.team !== actor.team && canParticipatePhysically(p) && !state.discipline?.[p.id]?.sentOff,
  );
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
    const defensiveArrival = Math.min(
      99,
      ...defenders
        .filter(
          (p) =>
            distance(p.position, point) / deriveMovementCapability(p).maximumSprintSpeed <
            arrival + 1,
        )
        .map((p) => carryRaceArrival(state, p, point)),
    );
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
  const depth = attacksRight(actor) ? end.x : 105 - end.x;
  const wide = Math.abs(end.y - 34) >= 15;
  const support = state.players.filter(
    (p) =>
      p.team === actor.team &&
      p.id !== actor.id &&
      (attacksRight(actor) ? p.position.x : 105 - p.position.x) > 65 &&
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
  const dir = attacksRight(actor) ? 1 : -1;
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
  const corridors = [0, (34 - actor.position.y) * 0.22, actor.position.y < 34 ? -4 : 4].map(
    (lateral) => ({ forward: range, lateral }),
  );
  const nearest = Math.min(
    99,
    ...state.players
      .filter((p) => p.team !== actor.team)
      .map((p) => distance(p.position, actor.position)),
  );
  if (nearest < 7) corridors.push({ forward: 14, lateral: -6 }, { forward: 14, lateral: 6 });
  for (const { forward, lateral } of corridors) {
    const target = clampPitchPoint({
      x: actor.position.x + dir * forward,
      y: actor.position.y + lateral,
    });
    const opportunity = projectCarryOpportunity(state, actor, target, 'sprint');
    if (
      opportunity.freeDistance >= 12 &&
      signedForwardDistance(actor.position, opportunity.target, actor) > 8
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
