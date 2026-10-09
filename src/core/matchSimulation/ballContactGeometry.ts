import { z } from 'zod';
import { integrateGroundRolling } from './ballPhysics';
import { distance, distanceToSegment, physicalPointSchema } from './matchSpace';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { angleForVector, normalizeAngle } from './playerOrientation';

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
  region: contactBodyRegionSchema,
  intendedPosition: physicalPointSchema,
  earliestAt: z.number().nonnegative(),
  expectedOrientation: z.number().finite(),
  reachableRadius: z.number().positive(),
  outgoingDirection: unit,
  difficulty: z.number().min(0).max(1),
});
export type PhysicalContactPlan = z.infer<typeof physicalContactPlanSchema>;
export const controlledBallContactSchema = z.object({
  actorId: z.string(),
  ownershipStartedAt: z.number().nonnegative(),
  lastContactAt: z.number().nonnegative(),
  physicalContacts: z.number().int().nonnegative(),
  nextContact: physicalContactPlanSchema,
  lastDirection: unit,
  lastBodyOrientation: z.number().finite(),
  balance: z.number().min(0).max(1),
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
      state.restart?.phase !== 'setup' &&
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
export const playerContactGeometry = (actor: MatchPlayerState) => {
  const forward = { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle) };
  const right = { x: forward.y, y: -forward.x };
  const foot = (side: number) => ({
    x: actor.position.x + forward.x * 0.2 + right.x * side * 0.17,
    y: actor.position.y + forward.y * 0.2 + right.y * side * 0.17,
  });
  return {
    leftFoot: foot(-1),
    rightFoot: foot(1),
    footReach: 0.82,
    torso: actor.position,
    torsoRadius: 0.34,
    headHeight: 1.65,
  };
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
  const destination = target ?? carry?.localTarget ?? carry?.target;
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
  const difficulty = clamp01(
    (turnAngle / Math.PI) * 0.32 +
      (bodyError / Math.PI) * 0.14 +
      ((Math.min(1, speed / 7) * turnAngle) / Math.PI) * 0.17 +
      Math.min(1, (actor.turnRate ?? 0) / 6) * 0.1 +
      Math.min(1, relativeBallSpeed / 8) * 0.14 +
      Math.max(0, offset - 0.45) * 0.17 +
      (1 - (active?.balance ?? 1)) * 0.14,
  );
  const preparation = 0.14 + (1 - skill) * 0.13 + difficulty * (0.16 + (1 - skill) * 0.22);
  const earliestContactAt = active
    ? Math.max(state.time, active.lastContactAt + preparation)
    : state.time;
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
            balance,
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
    const relativeSpeed = Math.hypot(
      defender.velocity.x - carrier.velocity.x,
      defender.velocity.y - carrier.velocity.y,
    );
    const compression = clamp01((1.35 - bodyMetres) / 0.35);
    load = clamp01(
      load +
        compression *
          (0.45 + relativeSpeed * 0.12) *
          (0.55 + (defender.profile.attributes.strength / 100) * 0.45),
    );
  }
  const resistance =
    (carrier.profile.attributes.strength / 100) * 0.72 +
    (carrier.profile.attributes.agility / 100) * 0.28;
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

/** One canonical ground integrator, finite contacts and velocity impulses. No ball coordinates
 * are derived from body orientation. The plan can miss; recovery uses the ordinary loose-ball
 * lifecycle. No RNG is needed to author a contact: contested outcomes retain the tackle model. */
export const advanceControlledBall = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  dt: number,
): { state: TacticalMatchState; looseVelocity?: { x: number; y: number } } => {
  if (state.ball.ownerId !== actor.id || state.ball.travelKind || state.restart?.phase === 'setup')
    return { state };
  const ownershipStartedAt =
    state.ballOwnershipStartedAt ?? state.onBallPreparation?.gainedAt ?? state.time;
  const previous =
    state.controlledBallContact?.actorId === actor.id &&
    state.controlledBallContact.ownershipStartedAt === ownershipStartedAt
      ? state.controlledBallContact
      : undefined;
  let active: ControlledBallContact = previous ?? {
    actorId: actor.id,
    ownershipStartedAt,
    lastContactAt: Math.max(0, state.time - 1),
    physicalContacts: 0,
    nextContact: planContact(state, actor),
    lastDirection: directionFor(actor.velocity, actor.facingAngle),
    lastBodyOrientation: actor.facingAngle,
    balance: 1,
  };
  const telemetry = { ...(state.contactControlTelemetry ?? emptyTelemetry()) };
  const rotation = Math.abs(normalizeAngle(actor.facingAngle - active.lastBodyOrientation));
  const window = estimateCarrierContactWindow({ ...state, controlledBallContact: active }, actor);
  const wanted = wantedDirection(state, actor);
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
  const reachable =
    Math.min(distance(geometry.leftFoot, state.ball), distance(geometry.rightFoot, state.ball)) <=
    geometry.footReach;
  let velocity = {
    x: state.ball.velocity?.x ?? actor.velocity.x,
    y: state.ball.velocity?.y ?? actor.velocity.y,
  };
  const bodyContest = deriveShieldBodyContest({ ...state, controlledBallContact: active }, actor);
  let balance = clamp01(
    active.balance +
      dt * (0.75 + actor.profile.attributes.agility / 100) * (1 - bodyContest.load * 0.9) -
      ((rotation * Math.hypot(actor.velocity.x, actor.velocity.y)) / 12) *
        (1 - (actor.profile.attributes.agility / 100) * 0.65),
  );
  balance = clamp01(balance - bodyContest.balanceDemand * dt * 3.2);
  if (state.time + 1e-8 >= active.nextContact.earliestAt && reachable) {
    const skill = controlSkill(actor);
    const interval = 0.15 + (1 - skill) * 0.14 + window.difficulty * 0.2 + (1 - balance) * 0.16;
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
    const efficiency =
      0.98 - window.difficulty * (0.12 + (1 - skill) * 0.43) - (1 - balance) * 0.24;
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
    velocity = {
      x: desired.x * efficiency + velocity.x * (1 - efficiency),
      y: desired.y * efficiency + velocity.y * (1 - efficiency),
    };
    balance = clamp01(balance - window.difficulty * (1 - skill) * 0.12);
    active = {
      ...active,
      lastContactAt: state.time,
      physicalContacts: active.physicalContacts + 1,
      lastDirection: wanted,
      balance,
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
        state.time + interval,
      ),
    };
    telemetry.physicalContacts++;
    if (window.difficulty > 0.5 && skill < 0.5) telemetry.heavyTouches++;
  } else telemetry.betweenContactSeconds += dt;
  const rolled = integrateGroundRolling(state.ball, velocity, dt);
  const ball = {
    ...state.ball,
    ...rolled.position,
    velocity: { ...rolled.velocity, z: 0 },
    height: 0,
    airborne: false,
  };
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
  };
  const maximumEnvelope =
    state.ballCarrierIntent?.actorId === actor.id &&
    state.ballCarrierIntent.executionMode === 'burst'
      ? 3.2
      : 2.05;
  if (distance(actor.position, ball) > maximumEnvelope) {
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
