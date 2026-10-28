import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  acquireFlightSighting,
  flightBeliefSchema,
  flightSightingSchema,
  occludesFlight,
  predictFlightBelief,
} from './ballFlightBelief';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { RandomGenerator } from '../random/RandomGenerator';
import { attacksRight, clampPitchPoint, distance } from './matchSpace';
import { deriveGoalkeeperBasePosition } from './goalkeeperPositioning';
import { selectMovementProposal, type MovementProposal } from './movementAuthority';

export const liveBallSensorSchema = z.object({
  sampledAt: z.number().nonnegative(),
  nextAcquisitionAt: z.number().nonnegative(),
  // The belief can also be imported directly by research tools, before the
  // motor-adapter cycle has finished initialising. Resolve schemas at parse time.
  optical: z.lazy(() => flightSightingSchema).nullable(),
  belief: z.lazy(() => flightBeliefSchema).optional(),
});
export const liveBallFlightRuntimeSchema = z.object({
  at: z.number().nonnegative(),
  sensors: z.record(z.string(), liveBallSensorSchema).refine((s) => Object.keys(s).length <= 22),
});
export type LiveBallFlightRuntime = z.infer<typeof liveBallFlightRuntimeSchema>;

/** Sensory acquisition alone reads physical position. Neither velocity, spin, shot metadata,
 * release target nor future trajectory crosses this boundary. One optical sample per 40Hz
 * frame and one inference per 100–200ms; two positions per player, no growing tapes. */
export const advanceLiveBallFlight = (state: TacticalMatchState): TacticalMatchState => {
  if (!state.experimentalBoundedBallFlightBelief) return state;
  if (!state.experimentalReceiverAnticipation || state.experimentalReceiverSynchronisation)
    throw Error(
      'Live bounded belief requires anticipation and excludes unvalidated synchronisation',
    );
  if (state.liveBallFlightRuntime?.at === state.time) return state;
  const sensors: LiveBallFlightRuntime['sensors'] = {};
  const position = { x: state.ball.x, y: state.ball.y, z: state.ball.height ?? 0.11 };
  for (const actor of state.players) {
    if (state.discipline?.[actor.id]?.sentOff) continue;
    const old = state.liveBallFlightRuntime?.sensors[actor.id];
    const gaze = state.experimentalActivePerception
      ? (state.activePerceptionRuntime?.memory[actor.id]?.gaze ?? actor.facingAngle)
      : actor.facingAngle;
    const delta = angleForVector({
      x: position.x - actor.position.x,
      y: position.y - actor.position.y,
    });
    const visible =
      distance(actor.position, position) <= 36 &&
      (distance(actor.position, position) < 2 || Math.abs(normalizeAngle(delta - gaze)) < 1.92) &&
      !state.players.some(
        (p) =>
          p.id !== actor.id &&
          !state.discipline?.[p.id]?.sentOff &&
          occludesFlight({ ...actor.position, z: 1.65 }, position, {
            centre: p.position,
            radius: 0.27,
            bottom: 0,
            top: 1.8 + (p.verticalJump?.height ?? 0),
          }),
      );
    const error = 0.006 + distance(actor.position, position) * 0.0005;
    const rng = RandomGenerator.fromSeed(
      `${state.seed}:pr200:optical:${actor.id}:${Math.round(state.time * 40)}`,
    );
    const optical = visible
      ? {
          at: state.time,
          position: {
            x: position.x + (rng.float() - 0.5) * error * 2,
            y: position.y + (rng.float() - 0.5) * error * 2,
            z: Math.max(0.11, position.z + (rng.float() - 0.5) * error * 2),
          },
          positionError: error,
        }
      : null;
    let belief = old?.belief;
    const due = state.time >= (old?.nextAcquisitionAt ?? 0) - 1e-8;
    if (optical && due) {
      const continuous = old?.optical && Math.abs(state.time - old.optical.at - 0.025) < 1e-6;
      belief = acquireFlightSighting(
        belief,
        {
          ...optical,
          ...(continuous
            ? { motion: { from: old.optical!.position, since: old.optical!.at } }
            : {}),
        },
        actor.profile.attributes.gameReading,
      );
    }
    // An absent sighting cannot refresh either evidence clock. Expiry is independent of truth.
    if (belief && state.time - belief.evidenceAt > 4) belief = undefined;
    sensors[actor.id] = {
      sampledAt: state.time,
      nextAcquisitionAt: due
        ? state.time + 0.1 + (100 - actor.profile.attributes.concentration) * 0.001
        : old!.nextAcquisitionAt,
      optical,
      ...(belief ? { belief } : {}),
    };
  }
  return { ...state, liveBallFlightRuntime: { at: state.time, sensors } };
};

export const observedFlight = (state: TacticalMatchState, actor: MatchPlayerState) =>
  predictFlightBelief(state.liveBallFlightRuntime?.sensors[actor.id]?.belief, state.time);

/** Reuse the existing authority order with only remembered/local proposals. A
 * reception estimate must not overwrite an already committed challenge or carry. */
export const boundedMovementTarget = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  reception: { x: number; y: number } | undefined,
  keeper: { x: number; y: number } | undefined,
) => {
  const episode = state.ballEpisode ?? 0;
  // A missing local intercept is not evidence that the receiver should abandon
  // this location for a formation anchor. Brake locally until a legal observed
  // plan exists. Canonical inertia, turning and finite contact remain unchanged.
  const awaitingReception =
    state.boundedReceiverRecovery === 'hold-local-v1' &&
    state.receptionPreparation?.actorId === actor.id &&
    !state.ball.ownerId &&
    !reception;
  const proposals: MovementProposal[] = [
    {
      authority: 'shape',
      target: awaitingReception ? actor.position : actor.neutralAnchor,
      validUntil: state.time + 0.1,
      episode,
    },
  ];
  const add = (
    authority: MovementProposal['authority'],
    target: { x: number; y: number },
    validUntil = state.time + 0.1,
  ) => proposals.push({ authority, target, validUntil, episode });
  if (reception) add('reception', reception);
  if (keeper) add('keeper', keeper);
  if (state.defensiveChallenge?.actorId === actor.id)
    add('commitment', state.defensiveChallenge.target, state.defensiveChallenge.expiresAt);
  if (state.ballCarrierIntent?.actorId === actor.id)
    add(
      state.ballCarrierIntent.humanSelected ? 'human' : 'commitment',
      state.ballCarrierIntent.target,
      state.ballCarrierIntent.expiresAt,
    );
  if (state.playerMovementIntent?.actorId === actor.id)
    add('human', state.playerMovementIntent.target, state.playerMovementIntent.expiresAt);
  return selectMovementProposal(proposals, state.time, episode)!.target;
};

/** A sensory view for legacy motor interfaces, anchored at actual acquisition, never now.
 * No motion evidence means no trajectory; callers retain ordinary positioning. */
export const observedMotorBall = (state: TacticalMatchState, actor: MatchPlayerState) => {
  const sensor = state.liveBallFlightRuntime?.sensors[actor.id],
    belief = sensor?.belief;
  return {
    at: belief?.lastObservation?.at ?? state.time,
    nextAt: sensor?.nextAcquisitionAt ?? state.time,
    ball:
      belief?.velocity && state.time - belief.evidenceAt <= 0.5
        ? {
            position: { ...belief.position },
            velocity: { ...belief.velocity },
            spin: { x: 0, y: 0, z: 0 },
            owner: null,
          }
        : null,
    others: [],
  };
};

/** Keeper anticipation from remembered geometry. A reactive intercept needs motion evidence
 * old enough for the keeper's own reaction, with its age and uncertainty still usable.
 * Runs for ordinary play as well as shots: hidden shot creation cannot change its command. */
export const boundedKeeperCommand = (state: TacticalMatchState, keeper: MatchPlayerState) => {
  const belief = state.liveBallFlightRuntime?.sensors[keeper.id]?.belief;
  const flight = observedFlight(state, keeper);
  const goalX = attacksRight(keeper) ? 0 : 105;
  const base = flight
    ? deriveGoalkeeperBasePosition(clampPitchPoint(flight.position), keeper)
    : { x: goalX === 0 ? 2 : 103, y: 34 };
  const reaction = 0.36 - keeper.profile.attributes.reflexes * 0.002;
  let target = base,
    reactive = false;
  if (
    flight?.hasMotionHistory &&
    belief?.firstUsefulAt !== null &&
    belief?.firstUsefulAt !== undefined &&
    state.time - belief.firstUsefulAt >= reaction &&
    (flight.velocityObservationAge ?? 9) <= 0.5 &&
    flight.uncertainty <= 3
  ) {
    const toward = goalX === 0 ? flight.velocity.x < -0.1 : flight.velocity.x > 0.1;
    const t = (keeper.position.x - flight.position.x) / flight.velocity.x;
    if (toward && t >= 0 && t <= 2.4) {
      const estimate = predictFlightBelief(belief, state.time + t);
      if (estimate) {
        target = { x: keeper.position.x, y: Math.max(30, Math.min(38, estimate.position.y)) };
        reactive = true;
      }
    }
  }
  return {
    target,
    reactive,
    facing: flight
      ? angleForVector({
          x: flight.position.x - keeper.position.x,
          y: flight.position.y - keeper.position.y,
        })
      : goalX === 0
        ? Math.PI / 2
        : -Math.PI / 2,
  };
};
