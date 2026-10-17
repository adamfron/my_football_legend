import { z } from 'zod';
import { createOffensiveScenario } from './pr163Fixtures';
import { createTacticalMatch } from './matchSimulation';
import type { MatchAction } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { deriveOnBallPreparation } from './onBallPreparation';

export const dynamicScenarioSchema = z.enum([
  'pr173-reception-pressure-1a',
  'pr173-winger-cut-1b',
  'pr173-momentum-duel-2a',
]);
export const dynamicFixtureOptionsSchema = z.object({
  scenario: dynamicScenarioSchema,
  seed: z.string().default('pr173-paired'),
  mirrored: z.boolean().default(false),
  secondHalf: z.boolean().default(false),
  cover: z.boolean().default(false),
  motion: z.enum(['crossing', 'aligned', 'stationary', 'recovering']).default('crossing'),
  skill: z.number().int().min(1).max(100).default(85),
  agility: z.number().int().min(1).max(100).default(85),
  readiness: z.number().min(0).max(1).default(1),
  receiverSpeed: z.number().min(0).max(8).default(4),
  approachSpeed: z.number().min(0).max(8).default(6),
  facingAway: z.boolean().default(false),
  passSpeed: z.number().positive().max(30).default(8),
  direction: z.enum(['inside', 'outside', 'straight']).default('inside'),
});
export type DynamicFixtureOptions = z.input<typeof dynamicFixtureOptionsSchema>;

/** Frozen geometries, not outcome scripts. All 22 bodies and the usual defenders remain
 * in the match. A mirror rotates the whole pitch, including velocities, facing and ends. */
export const createDynamicFixture = (
  input: DynamicFixtureOptions,
  create = createTacticalMatch,
) => {
  const options = dynamicFixtureOptionsSchema.parse(input);
  const fixture = createOffensiveScenario('directional_touch', options.seed, create);
  const { state, wingerId, defenderId, passerId } = fixture;
  const actor = state.players.find((p) => p.id === wingerId)!;
  const defender = state.players.find((p) => p.id === defenderId)!;
  const support = state.players.find((p) => p.id === passerId)!;
  const cover = state.players.find(
    (p) => p.team !== actor.team && p.id !== defenderId && p.slot.position === 'center_back',
  )!;
  actor.position = { x: 68, y: 10 };
  actor.target = { x: 80, y: 16 };
  actor.velocity = { x: options.receiverSpeed, y: 0 };
  actor.facingAngle = Math.PI / 2;
  Object.assign(actor.profile.attributes, {
    firstTouch: options.skill,
    technique: options.skill,
    dribbling: options.skill,
    agility: options.agility,
    composure: options.skill,
    gameReading: options.skill,
    concentration: options.skill,
    pace: 85,
  });
  actor.fitness!.burstReadiness = options.readiness;
  defender.position = { x: 70, y: 12.5 };
  const v = options.approachSpeed;
  defender.velocity =
    options.motion === 'crossing'
      ? { x: -v * 0.6, y: -v * 0.8 }
      : options.motion === 'aligned'
        ? { x: v * 0.6, y: v * 0.8 }
        : options.motion === 'recovering'
          ? { x: v, y: 0 }
          : { x: 0, y: 0 };
  defender.facingAngle = normalizeAngle(
    angleForVector(defender.velocity) + (options.facingAway ? Math.PI : 0),
  );
  defender.target = { ...actor.position };
  support.position = { x: 61, y: 16 };
  support.target = { ...support.position };
  if (options.cover) {
    cover.position = { x: 74, y: 17 };
    cover.target = { x: 71, y: 14 };
    cover.velocity = { x: -1, y: -2 };
    cover.facingAngle = angleForVector(cover.velocity);
  }
  state.currentPressure = 0.4;
  state.time = options.secondHalf ? 2800 : 20;
  state.status = options.secondHalf ? 'second_half' : 'first_half';
  delete state.timekeeping;
  state.endsSwitched = options.mirrored;
  let action: MatchAction = {
    type: 'carry',
    actorId: actor.id,
    target:
      options.direction === 'inside'
        ? { x: 79, y: 21 }
        : options.direction === 'outside'
          ? { x: 79, y: 5 }
          : { x: 82, y: 10 },
    movementMode: options.scenario === 'pr173-momentum-duel-2a' ? 'sprint' : 'dribble',
  };
  state.currentActorId = actor.id;
  state.ball = {
    x: actor.position.x + 0.45,
    y: actor.position.y,
    height: 0.11,
    ownerId: actor.id,
    lastTouchPlayerId: actor.id,
  };
  state.ballOwnershipStartedAt = state.time - 2;
  state.onBallPreparation = deriveOnBallPreparation(
    { ...state, time: state.time - 2 },
    actor,
    'clean_control',
  );
  if (options.scenario === 'pr173-reception-pressure-1a') {
    state.currentActorId = support.id;
    // A real low pass already in flight, 1.5m before contact. The origin/support remains
    // behind the receiver; no receiver ownership or contact outcome has been preassigned.
    state.ball = {
      x: 66.5,
      y: 10,
      height: 0.11,
      velocity: { x: options.passSpeed, y: 0, z: 0 },
      from: { x: 61, y: 10 },
      flightTime: 0.5,
      distanceTravelled: 5.5,
      travelKind: 'pass',
      sourceAction: 'pass',
      target: { ...actor.position },
      intendedReceiverId: actor.id,
      lastTouchPlayerId: support.id,
    };
    support.position = { x: 61, y: 10 };
    support.target = { ...support.position };
    state.lastPassDiagnostic = {
      passId: 'pr173-flight',
      passerId: support.id,
      intendedReceiverId: actor.id,
      releasedAt: state.time - 0.5,
      receiverPositionAtRelease: { x: actor.position.x - options.receiverSpeed * 0.5, y: 10 },
      receiverVelocityAtRelease: { ...actor.velocity },
      predictedReceptionPoint: { ...actor.position },
      awarenessDelay: 0.15,
      receiverArrivalEstimate: 0.2,
      bestDefenderArrivalEstimate: 0.5,
      leadDistance: 2,
      intent: 'progressive',
    };
    state.receptionPreparation = {
      actorId: actor.id,
      sourceActorId: support.id,
      releasedAt: state.time - 0.5,
      awarenessAt: state.time - 0.35,
      expectedContactPoint: { ...actor.position },
      expectedArrivalTime: state.time + 0.2,
      movement: 'run_onto_ball',
      ballEpisode: 'pr173-flight',
      readiness: {
        contactPoint: { ...actor.position },
        awareAt: 0.1,
        readyAt: 0.2,
        earliestUsefulContactTime: 0.32,
        preferredArrivalSpeed: 6,
        maximumComfortableArrivalSpeed: 12,
        preparationMargin: 0.3,
        movementTime: 0.1,
        orientationTime: 0.1,
      },
    };
    state.currentAction = {
      type: 'pass',
      actorId: support.id,
      receiverId: actor.id,
      target: { ...actor.position },
      intent: 'progressive',
    };
    delete state.onBallPreparation;
    // The original flight continues autonomously; this action is only its description.
    action = state.currentAction;
  }
  // Test absolute pitch directions independently from the period clock.
  if (options.mirrored) {
    const point = (p: { x: number; y: number }) => ({ x: 105 - p.x, y: 68 - p.y });
    for (const p of state.players) {
      p.position = point(p.position);
      p.target = point(p.target);
      p.velocity = { x: -p.velocity.x, y: -p.velocity.y };
      p.facingAngle = normalizeAngle(p.facingAngle + Math.PI);
      p.endsSwitched = true;
    }
    state.ball = {
      ...state.ball,
      ...point(state.ball),
      ...(state.ball.velocity
        ? {
            velocity: {
              ...state.ball.velocity,
              x: -state.ball.velocity.x,
              y: -state.ball.velocity.y,
            },
          }
        : {}),
      ...(state.ball.target ? { target: point(state.ball.target) } : {}),
    };
    if (state.ball.from) state.ball.from = point(state.ball.from);
    if (state.lastPassDiagnostic) {
      state.lastPassDiagnostic.receiverPositionAtRelease = point(
        state.lastPassDiagnostic.receiverPositionAtRelease,
      );
      state.lastPassDiagnostic.receiverVelocityAtRelease = {
        x: -state.lastPassDiagnostic.receiverVelocityAtRelease.x,
        y: -state.lastPassDiagnostic.receiverVelocityAtRelease.y,
      };
      state.lastPassDiagnostic.predictedReceptionPoint = point(
        state.lastPassDiagnostic.predictedReceptionPoint,
      );
    }
    if ('target' in action) action = { ...action, target: point(action.target) };
    if (state.currentAction && 'target' in state.currentAction)
      state.currentAction = { ...state.currentAction, target: point(state.currentAction.target) };
    if (state.receptionPreparation) {
      state.receptionPreparation.expectedContactPoint = point(
        state.receptionPreparation.expectedContactPoint,
      );
      state.receptionPreparation.readiness.contactPoint = point(
        state.receptionPreparation.readiness.contactPoint,
      );
    }
    if (state.onBallPreparation)
      state.onBallPreparation = deriveOnBallPreparation(
        { ...state, time: state.time - 2 },
        actor,
        'clean_control',
      );
  } else {
    for (const p of state.players) p.endsSwitched = false;
  }
  return {
    state,
    action,
    actorId: actor.id,
    defenderId,
    coverId: cover.id,
    supportId: support.id,
    options,
  };
};
