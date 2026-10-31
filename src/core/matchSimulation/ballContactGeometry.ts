import { isRestartSetup } from './restartPhase';
import { z } from 'zod';
import {
  chooseContactFoot,
  executeFootContact,
  footContactExecutionSchema,
  playerFootGeometry,
  selectFootSurface,
  multiContactStateSchema,
  multiContactSurface,
  beginMultiContactMove,
} from './footContact';
import { integrateBallFlight } from './ballPhysics';
import { BALL_RADIUS } from './ballFlight';
import { distance, distanceToSegment, physicalPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { canParticipatePhysically } from './matchInjuries';
import {
  deriveFitnessPhysicalModifiers,
  difficultActionPhysicalCost,
  recordPhysicalContactFitness,
} from './matchFitness';

export const contactBodyRegionSchema = z.enum([
  'left_foot',
  'right_foot',
  'lower_leg',
  'torso',
  'head',
]);
export type ContactBodyRegion = z.infer<typeof contactBodyRegionSchema>;
const unit = z.object({ x: z.number().min(-1).max(1), y: z.number().min(-1).max(1) });
export const physicalContactPlanSchema = z.object({
  actorId: z.string(),
  /** Intended region of the plan; the finite reach model has no independent limb solver. */
  region: contactBodyRegionSchema,
  intendedPosition: physicalPointSchema,
  earliestAt: z.number().nonnegative(),
  expectedOrientation: z.number().finite(),
  reachableRadius: z.number().positive(),
  outgoingDirection: unit,
  difficulty: z.number().min(0).max(1),
});
export type PhysicalContactPlan = z.infer<typeof physicalContactPlanSchema>;
/** One latest executed impulse/failed plan, never a per-tick contact archive. */
export const groundContactFactSchema = z.object({
  actorId: z.string(),
  at: z.number().nonnegative(),
  /** The nearest eligible foot on execution; intended region for an unexecuted plan. */
  region: contactBodyRegionSchema,
  intendedRegion: contactBodyRegionSchema.optional(),
  point: physicalPointSchema,
  incomingVelocity: physicalPointSchema,
  outgoingVelocity: physicalPointSchema,
  /** Actual retained impulse efficiency, not an inferred probability of success. */
  quality: z.number().min(0).max(1).optional(),
  retained: z.boolean(),
  executed: z.boolean(),
  physicalCount: z.number().int().nonnegative(),
  surfaceContact: footContactExecutionSchema.optional(),
});
export type GroundContactFact = z.infer<typeof groundContactFactSchema>;
export const controlledBallContactSchema = z.object({
  actorId: z.string(),
  ownershipStartedAt: z.number().nonnegative(),
  lastContactAt: z.number().nonnegative(),
  physicalContacts: z.number().int().nonnegative(),
  nextContact: physicalContactPlanSchema,
  lastDirection: unit,
  lastBodyOrientation: z.number().finite(),
  balance: z.number().min(0).max(1),
  multiContact: multiContactStateSchema.optional(),
});
export type ControlledBallContact = z.infer<typeof controlledBallContactSchema>;
export const contactControlTelemetrySchema = z.object({
  physicalContacts: z.number().int().nonnegative(),
  failedControls: z.number().int().nonnegative(),
  heavyTouches: z.number().int().nonnegative(),
  planRevisions: z.number().int().nonnegative(),
  betweenContactSeconds: z.number().nonnegative(),
  exposedSeconds: z.number().nonnegative(),
  shieldingSeconds: z.number().nonnegative(),
  absoluteTurnRadians: z.number().nonnegative(),
});
export type ContactControlTelemetry = z.infer<typeof contactControlTelemetrySchema>;
const emptyTelemetry = (): ContactControlTelemetry => ({
  physicalContacts: 0,
  failedControls: 0,
  heavyTouches: 0,
  planRevisions: 0,
  betweenContactSeconds: 0,
  exposedSeconds: 0,
  shieldingSeconds: 0,
  absoluteTurnRadians: 0,
});
/** Release/restart/ownership continuity invalidates anticipation without altering the ball. */
export const reconcileControlledBallContact = (state: TacticalMatchState): TacticalMatchState => {
  const active = state.controlledBallContact;
  if (
    !active ||
    (state.ball.ownerId === active.actorId &&
      !state.ball.travelKind &&
      state.ball.looseSince === undefined &&
      !isRestartSetup(state) &&
      (state.ballOwnershipStartedAt === undefined ||
        active.ownershipStartedAt === state.ballOwnershipStartedAt))
  )
    return state;
  const next = { ...state };
  delete next.controlledBallContact;
  return next;
};
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const directionFor = (vector: { x: number; y: number }, fallback: number) => {
  const length = Math.hypot(vector.x, vector.y);
  return length > 0.01
    ? { x: vector.x / length, y: vector.y / length }
    : { x: Math.sin(fallback), y: Math.cos(fallback) };
};

/** Metres, pitch x/y and the existing orientation convention: 0 faces positive y. */
export const playerContactGeometry = playerFootGeometry;
/** One motor recovery deadline for control and release. A planned control touch
 * cannot consume the ball before the recovery reported by the previous surface. */
export const motorContactReadyAt = (state: TacticalMatchState, actorId: string) => {
  const last = state.lastGroundContact;
  const footReady =
    last?.actorId === actorId
      ? last.at + Math.max(0.12, last.surfaceContact?.recoverySeconds ?? 0)
      : state.time;
  return state.experimentalBodyContacts
    ? Math.max(footReady, state.experimentalBodyContacts.readyAt[actorId] ?? 0)
    : footReady;
};
const controlSkill = (actor: MatchPlayerState) => {
  const a = actor.profile.attributes;
  return (
    Math.sqrt((a.technique / 100) * (a.dribbling / 100)) * 0.52 +
    (a.agility / 100) * 0.2 +
    (a.firstTouch / 100) * 0.16 +
    (a.composure / 100) * 0.12
  );
};
const wantedDirection = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  target?: { x: number; y: number },
) => {
  const carry = state.ballCarrierIntent?.actorId === actor.id ? state.ballCarrierIntent : undefined;
  const micro =
    state.onBallPreparation?.actorId === actor.id ? state.onBallPreparation.micro : undefined;
  if (!target && (carry?.executionMode === 'shield' || micro?.shielding)) {
    let nearest: MatchPlayerState | undefined;
    let nearestMetres = Infinity;
    for (const player of state.players) {
      if (player.team === actor.team || state.discipline?.[player.id]?.sentOff) continue;
      const metres = distance(player.position, actor.position);
      if (
        metres < nearestMetres ||
        (metres === nearestMetres && player.id.localeCompare(nearest!.id) < 0)
      ) {
        nearest = player;
        nearestMetres = metres;
      }
    }
    if (nearest)
      return directionFor(
        { x: actor.position.x - nearest.position.x, y: actor.position.y - nearest.position.y },
        actor.facingAngle,
      );
  }
  // Approaching a pushed touch and aiming the next physical contact have different targets.
  // The impulse can turn toward the chosen destination only when an actual foot reaches it.
  const destination =
    target ?? (carry?.pursuingBall ? carry.target : carry?.localTarget) ?? carry?.target;
  return destination
    ? directionFor(
        { x: destination.x - actor.position.x, y: destination.y - actor.position.y },
        actor.facingAngle,
      )
    : micro
      ? directionFor(micro.ballOffset, actor.facingAngle)
      : directionFor(actor.velocity, actor.facingAngle);
};
export const carrierContactWindowSchema = z.object({
  earliestContactAt: z.number().nonnegative(),
  difficulty: z.number().min(0).max(1),
  exposure: z.number().min(0).max(1),
  turnAngle: z.number().nonnegative(),
});
/** Anticipation only. A reaching defender or changing trajectory can invalidate this estimate. */
export const estimateCarrierContactWindow = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  target?: { x: number; y: number },
) => {
  const direction = wantedDirection(state, actor, target);
  const active =
    state.controlledBallContact?.actorId === actor.id ? state.controlledBallContact : undefined;
  const oldDirection =
    active?.lastDirection ?? directionFor(state.ball.velocity ?? actor.velocity, actor.facingAngle);
  const turnAngle = Math.abs(
    normalizeAngle(angleForVector(direction) - angleForVector(oldDirection)),
  );
  const bodyError = Math.abs(normalizeAngle(angleForVector(direction) - actor.facingAngle));
  const relativeBallSpeed = Math.hypot(
    (state.ball.velocity?.x ?? actor.velocity.x) - actor.velocity.x,
    (state.ball.velocity?.y ?? actor.velocity.y) - actor.velocity.y,
  );
  const offset = distance(actor.position, state.ball);
  const speed = Math.hypot(actor.velocity.x, actor.velocity.y);
  const skill = controlSkill(actor);
  const fitness = deriveFitnessPhysicalModifiers(actor);
  const difficulty = clamp01(
    (turnAngle / Math.PI) * 0.32 +
      (bodyError / Math.PI) * 0.14 +
      ((Math.min(1, speed / 7) * turnAngle) / Math.PI) * 0.17 +
      Math.min(1, (actor.turnRate ?? 0) / 6) * 0.1 +
      Math.min(1, relativeBallSpeed / 8) * 0.14 +
      Math.max(0, offset - 0.45) * 0.17 +
      (1 - (active?.balance ?? 1)) * 0.14 +
      difficultActionPhysicalCost(
        actor,
        (turnAngle / Math.PI) * Math.min(1, speed / 6) + relativeBallSpeed / 12,
      ) *
        0.2,
  );
  const preparation =
    (0.14 + (1 - skill) * 0.13 + difficulty * (0.16 + (1 - skill) * 0.22)) *
    (1 + (fitness.contactRecovery - 1) * difficulty);
  const earliestContactAt = active
    ? Math.max(state.time, active.lastContactAt + preparation, motorContactReadyAt(state, actor.id))
    : Math.max(state.time, motorContactReadyAt(state, actor.id));
  return {
    earliestContactAt,
    difficulty,
    exposure: clamp01(Math.max(0, offset - 0.3) / 1.3 + relativeBallSpeed / 12 + difficulty * 0.3),
    turnAngle,
  };
};

export const ballContactAccessSchema = z.object({
  bodyOccludes: z.boolean(),
  ballReachable: z.boolean(),
  shielding: z.number().min(0).max(1),
  defenderEta: z.number().nonnegative(),
  carrierEta: z.number().nonnegative(),
  exposure: z.number().min(0).max(1),
});
/** Ownership never excludes an opposing foot. The torso blocks a direct ball path, not a magic
 * possession state; a second angle has its own independent geometry and contact opportunity. */
export const deriveBallContactAccess = (
  state: TacticalMatchState,
  defender: MatchPlayerState,
  carrier: MatchPlayerState,
  reach = 0.95,
) => {
  const body = playerContactGeometry(carrier);
  const ballMetres = distance(defender.position, state.ball);
  const bodyMetres = distance(defender.position, carrier.position);
  const bodyOccludes =
    bodyMetres < ballMetres &&
    distanceToSegment(carrier.position, defender.position, state.ball) < body.torsoRadius;
  const shieldSelected =
    (state.ballCarrierIntent?.actorId === carrier.id &&
      state.ballCarrierIntent.executionMode === 'shield') ||
    (state.onBallPreparation?.actorId === carrier.id &&
      Boolean(state.onBallPreparation.micro?.shielding));
  const alignment = Math.abs(
    normalizeAngle(
      angleForVector({
        x: state.ball.x - defender.position.x,
        y: state.ball.y - defender.position.y,
      }) - defender.facingAngle,
    ),
  );
  const closing = Math.max(
    0,
    ((defender.velocity.x - (state.ball.velocity?.x ?? carrier.velocity.x)) *
      (state.ball.x - defender.position.x) +
      (defender.velocity.y - (state.ball.velocity?.y ?? carrier.velocity.y)) *
        (state.ball.y - defender.position.y)) /
      Math.max(0.01, ballMetres),
  );
  const angularAccess = Math.abs(
    normalizeAngle(
      angleForVector({
        x: state.ball.x - carrier.position.x,
        y: state.ball.y - carrier.position.y,
      }) -
        angleForVector({
          x: defender.position.x - carrier.position.x,
          y: defender.position.y - carrier.position.y,
        }),
    ),
  );
  const accessDistance = bodyOccludes
    ? Math.abs(bodyMetres - 0.75) +
      angularAccess * 0.75 +
      Math.max(0, distance(state.ball, carrier.position) - 0.75)
    : ballMetres;
  const defenderEta = Math.max(0, accessDistance - reach) / Math.max(1.2, closing);
  const window = estimateCarrierContactWindow(state, carrier);
  const carrierEta = Math.max(
    0,
    (state.controlledBallContact?.actorId === carrier.id
      ? state.controlledBallContact.nextContact.earliestAt
      : window.earliestContactAt) - state.time,
  );
  const balance =
    state.controlledBallContact?.actorId === carrier.id ? state.controlledBallContact.balance : 1;
  const shielding =
    shieldSelected && bodyOccludes
      ? clamp01(
          ((carrier.profile.attributes.strength / 100) * 0.65 +
            (carrier.profile.attributes.agility / 100) * 0.35) *
            balance *
            deriveFitnessPhysicalModifiers(carrier).shielding,
        )
      : 0;
  return {
    bodyOccludes,
    ballReachable:
      !bodyOccludes &&
      ballMetres <= reach &&
      alignment <= Math.PI * 0.5 &&
      (state.ball.height ?? 0) < 0.5,
    shielding,
    defenderEta,
    carrierEta,
    exposure: bodyOccludes
      ? window.exposure * 0.15
      : clamp01(window.exposure + Math.max(0, carrierEta - defenderEta) * 0.7),
  };
};

export const shieldBodyContestSchema = z.object({
  load: z.number().min(0).max(1),
  balanceDemand: z.number().min(0).max(1),
});
/** A body contest loads balance only when a defender actually reaches the protecting torso.
 * Strength resists compression/momentum; agility recovers the stance. An exposed-side foot
 * remains available to the common challenge resolver whatever the carrier's Strength. */
export const deriveShieldBodyContest = (state: TacticalMatchState, carrier: MatchPlayerState) => {
  const shieldSelected =
    (state.ballCarrierIntent?.actorId === carrier.id &&
      state.ballCarrierIntent.executionMode === 'shield') ||
    (state.onBallPreparation?.actorId === carrier.id &&
      Boolean(state.onBallPreparation.micro?.shielding));
  if (!shieldSelected) return { load: 0, balanceDemand: 0 };
  let load = 0;
  for (const defender of state.players) {
    if (defender.team === carrier.team || state.discipline?.[defender.id]?.sentOff) continue;
    const bodyMetres = distance(defender.position, carrier.position);
    if (bodyMetres > 1.35) continue;
    const bodyOccludes =
      bodyMetres < distance(defender.position, state.ball) &&
      distanceToSegment(carrier.position, defender.position, state.ball) < 0.34;
    if (!bodyOccludes) continue;
    const relativeSpeed = Math.max(
      0,
      ((defender.velocity.x - carrier.velocity.x) * (carrier.position.x - defender.position.x) +
        (defender.velocity.y - carrier.velocity.y) * (carrier.position.y - defender.position.y)) /
        Math.max(0.01, bodyMetres),
    );
    const compression = clamp01((1.35 - bodyMetres) / 0.35);
    load = clamp01(
      load +
        compression *
          (0.45 + relativeSpeed * 0.12) *
          (0.55 + (defender.profile.attributes.strength / 100) * 0.45) *
          Math.max(0.65, Math.min(1.4, defender.profile.weightKg / carrier.profile.weightKg)),
    );
  }
  const resistance =
    ((carrier.profile.attributes.strength / 100) * 0.72 +
      (carrier.profile.attributes.agility / 100) * 0.28) *
    deriveFitnessPhysicalModifiers(carrier).shielding;
  return { load, balanceDemand: load * (1 - resistance) };
};

const planContact = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  earliestAt?: number,
): PhysicalContactPlan => {
  const direction = wantedDirection(state, actor);
  const window = estimateCarrierContactWindow(state, actor);
  const geometry = playerContactGeometry(actor);
  const region =
    distance(geometry.leftFoot, state.ball) < distance(geometry.rightFoot, state.ball)
      ? 'left_foot'
      : 'right_foot';
  const eta = Math.max(0, (earliestAt ?? window.earliestContactAt) - state.time);
  return {
    actorId: actor.id,
    region,
    intendedPosition: {
      x: state.ball.x + (state.ball.velocity?.x ?? actor.velocity.x) * eta,
      y: state.ball.y + (state.ball.velocity?.y ?? actor.velocity.y) * eta,
    },
    earliestAt: earliestAt ?? window.earliestContactAt,
    expectedOrientation: angleForVector(direction),
    reachableRadius: geometry.footReach,
    outgoingDirection: direction,
    difficulty: window.difficulty,
  };
};

/** The same finite foot impulse serves ongoing control and a directional first contact.
 * Correct toward a nearby controllable offset over one contact interval; never move the ball
 * to that offset. Skill bounds correction speed and difficulty dissipates the impulse. */
export const deriveGroundControlImpulse = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  wanted: { x: number; y: number },
  offset: number,
  interval: number,
  difficulty: number,
  balance = 1,
) => {
  const skill = controlSkill(actor);
  const efficiency = 0.98 - difficulty * (0.12 + (1 - skill) * 0.43) - (1 - balance) * 0.24;
  const correction = {
    x: (actor.position.x + wanted.x * offset - state.ball.x) / interval,
    y: (actor.position.y + wanted.y * offset - state.ball.y) / interval,
  };
  const correctionSpeed = Math.hypot(correction.x, correction.y);
  const scale = Math.min(1, (3.8 + skill * 3.4) / Math.max(0.01, correctionSpeed));
  const desired = {
    x: actor.velocity.x + correction.x * scale + wanted.x * 1.6 * interval,
    y: actor.velocity.y + correction.y * scale + wanted.y * 1.6 * interval,
  };
  return {
    efficiency,
    velocity: {
      x: desired.x * efficiency + (state.ball.velocity?.x ?? actor.velocity.x) * (1 - efficiency),
      y: desired.y * efficiency + (state.ball.velocity?.y ?? actor.velocity.y) * (1 - efficiency),
    },
  };
};

/** One canonical ground integrator, finite contacts and velocity impulses. No ball coordinates
 * are derived from body orientation. The plan can miss; recovery uses the ordinary loose-ball
 * lifecycle. No RNG is needed to author a contact: contested outcomes retain the tackle model. */
export const advanceControlledBall = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  dt: number,
  requiredFoot?: 'left' | 'right',
  previousBodyPosition?: { x: number; y: number },
): { state: TacticalMatchState; looseVelocity?: { x: number; y: number } } => {
  if (
    state.ball.ownerId !== actor.id ||
    state.ball.travelKind ||
    isRestartSetup(state) ||
    !canParticipatePhysically(actor)
  )
    return { state };
  const ownershipStartedAt =
    state.ballOwnershipStartedAt ?? state.onBallPreparation?.gainedAt ?? state.time;
  const previous =
    state.controlledBallContact?.actorId === actor.id &&
    state.controlledBallContact.ownershipStartedAt === ownershipStartedAt
      ? state.controlledBallContact
      : undefined;
  const recent =
    state.lastGroundContact?.actorId === actor.id &&
    state.lastGroundContact.executed &&
    state.time - state.lastGroundContact.at < 0.5
      ? state.lastGroundContact
      : undefined;
  let active: ControlledBallContact = previous ?? {
    actorId: actor.id,
    ownershipStartedAt,
    lastContactAt: recent?.at ?? Math.max(0, state.time - 1),
    physicalContacts: recent?.physicalCount ?? 0,
    nextContact: planContact(
      state,
      actor,
      recent
        ? Math.max(state.time, recent.at + (recent.surfaceContact?.recoverySeconds ?? 0.1))
        : undefined,
    ),
    lastDirection: directionFor(actor.velocity, actor.facingAngle),
    lastBodyOrientation: actor.facingAngle,
    balance: 1,
  };
  const telemetry = { ...(state.contactControlTelemetry ?? emptyTelemetry()) };
  const rotation = Math.abs(normalizeAngle(actor.facingAngle - active.lastBodyOrientation));
  const window = estimateCarrierContactWindow({ ...state, controlledBallContact: active }, actor);
  const wanted = wantedDirection(state, actor);
  const carryIntent =
    state.ballCarrierIntent?.actorId === actor.id ? state.ballCarrierIntent : undefined;
  if (!active.multiContact && carryIntent?.skillMove && state.time - carryIntent.startedAt < 0.1)
    active = {
      ...active,
      multiContact: beginMultiContactMove(
        actor,
        state.time,
        carryIntent.skillMove,
        wanted,
        carryIntent.contactFoot,
      ),
    };
  const move = active.multiContact;
  const activeMove = move?.status === 'active' && state.time <= move.expiresAt ? move : undefined;
  if (move?.status === 'active' && state.time > move.expiresAt)
    active = { ...active, multiContact: { ...move, status: 'failed' } };
  if (
    Math.abs(
      normalizeAngle(angleForVector(wanted) - angleForVector(active.nextContact.outgoingDirection)),
    ) > 0.65
  ) {
    active = {
      ...active,
      nextContact: planContact(
        { ...state, controlledBallContact: active },
        actor,
        Math.max(active.nextContact.earliestAt, window.earliestContactAt),
      ),
    };
    telemetry.planRevisions++;
  }
  const geometry = playerContactGeometry(actor);
  const executionFoot = activeMove?.foot ?? requiredFoot ?? carryIntent?.contactFoot;
  const reachable = executionFoot
    ? distance(geometry[executionFoot === 'left' ? 'leftFoot' : 'rightFoot'], state.ball) <=
      geometry.footReach
    : Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)) <=
      geometry.footReach;
  let velocity = {
    x: state.ball.velocity?.x ?? actor.velocity.x,
    y: state.ball.velocity?.y ?? actor.velocity.y,
  };
  let contactFact: GroundContactFact | undefined;
  const bodyContest = deriveShieldBodyContest({ ...state, controlledBallContact: active }, actor);
  const fitness = deriveFitnessPhysicalModifiers(actor);
  let balance = clamp01(
    active.balance +
      dt *
        (0.75 + actor.profile.attributes.agility / 100) *
        fitness.balanceRecovery *
        (1 - bodyContest.load * 0.9) -
      ((rotation * Math.hypot(actor.velocity.x, actor.velocity.y)) / 12) *
        (1 - (actor.profile.attributes.agility / 100) * 0.65),
  );
  balance = clamp01(balance - bodyContest.balanceDemand * dt * 3.2);
  if (
    state.time + 1e-8 >=
      Math.max(
        activeMove?.nextAt ?? active.nextContact.earliestAt,
        motorContactReadyAt(state, actor.id),
      ) &&
    reachable
  ) {
    const skill = controlSkill(actor);
    const interval =
      (0.15 + (1 - skill) * 0.14 + window.difficulty * 0.2 + (1 - balance) * 0.16) *
      (1 + (fitness.contactRecovery - 1) * window.difficulty);
    const carry =
      state.ballCarrierIntent?.actorId === actor.id ? state.ballCarrierIntent : undefined;
    const offset =
      carry?.executionMode === 'burst'
        ? (carry.touchDistance ?? 1.35)
        : carry?.executionMode === 'shield'
          ? 0.43
          : (carry?.touchDistance ??
            (state.onBallPreparation?.actorId === actor.id &&
            state.onBallPreparation.micro?.phase === 'directional_touch'
              ? 0.72
              : 0.43));
    const contactWanted = activeMove
      ? activeMove.phase === 0
        ? activeMove.firstDirection
        : activeMove.secondDirection
      : wanted;
    const impulse = deriveGroundControlImpulse(
      state,
      actor,
      contactWanted,
      activeMove ? 0.38 : offset,
      interval,
      window.difficulty,
      balance,
    );
    const foot = chooseContactFoot(actor, state.ball, executionFoot);
    const surfaceContact = executeFootContact(state, actor, {
      intended: activeMove
        ? multiContactSurface(activeMove)
        : selectFootSurface(state, actor, wanted, foot),
      foot,
      desiredVelocity: { ...impulse.velocity, z: 0 },
      balance,
      preparationSeconds: Math.max(0.012, state.time - active.lastContactAt),
      contactSeconds: Math.min(0.12, interval * 0.3),
      pressure: state.currentPressure,
    });
    const efficiency = surfaceContact.quality;
    velocity = surfaceContact.outgoingVelocity;
    contactFact = {
      actorId: actor.id,
      at: state.time,
      region: `${foot}_foot`,
      intendedRegion: active.nextContact.region,
      point: { x: state.ball.x, y: state.ball.y },
      incomingVelocity: {
        x: state.ball.velocity?.x ?? actor.velocity.x,
        y: state.ball.velocity?.y ?? actor.velocity.y,
      },
      outgoingVelocity: { ...velocity },
      quality: efficiency,
      retained: true,
      executed: surfaceContact.available,
      physicalCount: active.physicalContacts + Number(surfaceContact.available),
      surfaceContact,
    };
    balance = clamp01(balance - window.difficulty * (1 - skill) * 0.12);
    active = {
      ...active,
      lastContactAt: state.time,
      physicalContacts: active.physicalContacts + Number(surfaceContact.available),
      lastDirection: wanted,
      balance,
      ...(activeMove
        ? {
            multiContact: {
              ...activeMove,
              phase: surfaceContact.available ? (activeMove.phase === 0 ? 1 : 2) : activeMove.phase,
              nextAt: state.time + Math.max(0.12, interval * 0.55, surfaceContact.recoverySeconds),
              status: surfaceContact.available
                ? activeMove.phase === 0
                  ? 'active'
                  : 'completed'
                : 'failed',
            },
          }
        : {}),
      nextContact: planContact(
        {
          ...state,
          ball: { ...state.ball, velocity },
          controlledBallContact: {
            ...active,
            lastContactAt: state.time,
            lastDirection: wanted,
            balance,
          },
        },
        actor,
        state.time + Math.max(interval, 0.12, surfaceContact.recoverySeconds),
      ),
    };
    telemetry.physicalContacts += Number(surfaceContact.available);
    if (window.difficulty > 0.5 && skill < 0.5) telemetry.heavyTouches++;
  } else telemetry.betweenContactSeconds += dt;
  const spin = contactFact?.surfaceContact?.outgoingSpin ?? state.ball.spin;
  const physical = integrateBallFlight(
    {
      position: {
        x: state.ball.x,
        y: state.ball.y,
        z: Math.max(BALL_RADIUS, state.ball.height ?? BALL_RADIUS),
      },
      velocity: {
        ...velocity,
        z: contactFact?.surfaceContact?.outgoingVelocity.z ?? state.ball.velocity?.z ?? 0,
      },
      ...(spin ? { spin } : {}),
      airborne: state.ball.airborne ?? false,
      bounceCount: state.ball.bounceCount ?? 0,
    },
    dt,
    state.ballEnvironment,
  );
  const rolled = {
    position: { x: physical.position.x, y: physical.position.y },
    velocity: physical.velocity,
  };
  const ball = {
    ...state.ball,
    ...rolled.position,
    velocity: physical.velocity,
    height: physical.position.z,
    airborne: physical.airborne,
    bounceCount: physical.bounceCount,
    ...(physical.spin ? { spin: physical.spin } : {}),
  };
  // Dropping a caught ball into ordinary foot control ends the hand-distribution window.
  // It must never leave an owned ball stationary while its goalkeeper walks away.
  if (contactFact?.executed) delete ball.heldByKeeperId;
  active = { ...active, lastBodyOrientation: actor.facingAngle, balance };
  const localDefenders = state.players.filter(
    (p) =>
      p.team !== actor.team && distance(p.position, ball) < 3 && !state.discipline?.[p.id]?.sentOff,
  );
  let exposed = false,
    shielding = false;
  for (const defender of localDefenders) {
    const access = deriveBallContactAccess(
      { ...state, ball, controlledBallContact: active },
      defender,
      actor,
    );
    exposed ||= access.ballReachable;
    shielding ||= access.shielding > 0;
  }
  if (exposed) telemetry.exposedSeconds += dt;
  if (shielding) telemetry.shieldingSeconds += dt;
  telemetry.absoluteTurnRadians += rotation;
  const next: TacticalMatchState = {
    ...state,
    ball,
    controlledBallContact: active,
    contactControlTelemetry: telemetry,
    ...(contactFact ? { lastGroundContact: contactFact } : {}),
    ...(bodyContest.load > 0
      ? {
          players: state.players.map((player) =>
            player.id === actor.id
              ? recordPhysicalContactFitness(player, bodyContest.load, dt)
              : player,
          ),
        }
      : {}),
  };
  const maximumEnvelope =
    state.ballCarrierIntent?.actorId === actor.id &&
    state.ballCarrierIntent.executionMode === 'burst'
      ? 3.2
      : 2.05;
  // A due follow-up contact has actually missed when the foot cannot reach and
  // body collision prevents the attempted recovery step. Nominal locomotion
  // velocity is not evidence of movement. End protected control, then let the
  // ordinary loose-ball contact/acquisition lifecycle decide who recovers it.
  const blockedMissedContact =
    previous !== undefined &&
    previousBodyPosition !== undefined &&
    !reachable &&
    state.time + 1e-8 >=
      Math.max(active.nextContact.earliestAt, motorContactReadyAt(state, actor.id)) &&
    distance(previousBodyPosition, actor.position) < 0.00001 &&
    Math.hypot(actor.velocity.x, actor.velocity.y) > 0.1;
  if (blockedMissedContact || distance(actor.position, ball) > maximumEnvelope) {
    next.lastGroundContact = contactFact
      ? { ...contactFact, retained: false }
      : {
          actorId: actor.id,
          at: state.time,
          region: active.nextContact.region,
          point: { x: ball.x, y: ball.y },
          incomingVelocity: {
            x: state.ball.velocity?.x ?? actor.velocity.x,
            y: state.ball.velocity?.y ?? actor.velocity.y,
          },
          outgoingVelocity: { ...rolled.velocity },
          retained: false,
          executed: false,
          physicalCount: active.physicalContacts,
        };
    next.contactControlTelemetry = { ...telemetry, failedControls: telemetry.failedControls + 1 };
    delete next.controlledBallContact;
    next.pendingPossessionLoss = {
      id: `${state.seed}:carry-control-error:${state.time.toFixed(6)}:${actor.id}`,
      at: state.time,
      team: actor.team,
      actorId: actor.id,
      cause: 'failed_control',
    };
    return { state: next, looseVelocity: rolled.velocity };
  }
  return { state: next };
};
