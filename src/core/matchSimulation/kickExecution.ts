import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import {
  activeStrikeCapability,
  chooseContactFoot,
  executeFootContact,
  FOOT_CONTACT_PHYSICS,
} from './footContact';
import {
  kickExecutionReceiptSchema,
  kickPerturbationSchema,
  kickVectorSchema,
  type KickExecutionReceipt,
} from './kickExecutionState';

type V = z.infer<typeof kickVectorSchema>;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (v: V): V => {
  const length = Math.max(1e-9, Math.hypot(v.x, v.y, v.z));
  return { x: v.x / length, y: v.y / length, z: v.z / length };
};
const zero = (): V => ({ x: 0, y: 0, z: 0 });
const gaussian = (rng: RandomGenerator) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, rng.float()))) * Math.cos(2 * Math.PI * rng.float());

export const kickSolutionRequestSchema = z.object({
  family: z.enum(['pass', 'shot']),
  target: z.object({ x: z.number().finite(), y: z.number().finite() }),
  nominalVelocity: kickVectorSchema,
  surface: z.enum(['inside', 'instep']),
  foot: z.enum(['left', 'right']).optional(),
  preparationSeconds: z.number().nonnegative().default(0.24),
});

/** Pure release-time translator. No forecast, state mutation or shared match RNG.
 * Overrides are laboratory interventions on contact variables, never downstream ball state. */
export const executePhysicalKick = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  input: z.input<typeof kickSolutionRequestSchema>,
  perturbationOverride?: z.infer<typeof kickPerturbationSchema>,
): KickExecutionReceipt => {
  const request = kickSolutionRequestSchema.parse(input);
  const a = actor.profile.attributes;
  const foot = chooseContactFoot(actor, state.ball, request.foot);
  const weak =
    foot === actor.profile.dominantFoot ? 0 : 1 - actor.profile.weakFootProficiency / 100;
  const primary = request.family === 'pass' ? a.passing : a.finishing;
  const skill = (primary * 0.65 + a.technique * 0.35) / 100;
  const balance = actor.plantBalance?.balance ?? 1;
  let nearest = 14;
  let obstructionTime = Number.POSITIVE_INFINITY;
  for (const p of state.players) {
    if (p.team === actor.team) continue;
    const dx = state.ball.x - p.position.x,
      dy = state.ball.y - p.position.y;
    const metres = Math.hypot(dx, dy);
    nearest = Math.min(nearest, metres);
    const closing =
      (dx * (p.velocity.x - actor.velocity.x) + dy * (p.velocity.y - actor.velocity.y)) /
      Math.max(0.01, metres);
    if (closing > 0.1)
      obstructionTime = Math.min(obstructionTime, Math.max(0, metres - 0.8) / closing);
  }
  const pressure = clamp(1 - nearest / 14);
  // Only an actual possession preparation clock can shorten the assumed motor window.
  // Prospective support age/gameReading deliberately has no shortcut into this contract.
  const preparation =
    state.onBallPreparation?.actorId === actor.id
      ? Math.min(
          request.preparationSeconds,
          Math.max(0, state.time - state.onBallPreparation.gainedAt),
        )
      : request.preparationSeconds;
  const preparationSeconds = Math.min(preparation, obstructionTime);
  const ready = clamp(preparationSeconds / (0.12 + (1 - a.agility / 100) * 0.1));
  const incoming = {
    x: state.ball.velocity?.x ?? 0,
    y: state.ball.velocity?.y ?? 0,
    z: state.ball.velocity?.z ?? 0,
  };
  const change = {
    x: request.nominalVelocity.x - incoming.x,
    y: request.nominalVelocity.y - incoming.y,
    z: request.nominalVelocity.z - incoming.z,
  };
  const nominalNormal =
    Math.hypot(change.x, change.y, change.z) > 1e-8
      ? unit(change)
      : { x: Math.sin(actor.facingAngle), y: Math.cos(actor.facingAngle), z: 0 };
  const heading = Math.atan2(nominalNormal.y, nominalNormal.x);
  const facing = Math.atan2(Math.cos(actor.facingAngle), Math.sin(actor.facingAngle));
  const alignmentError = Math.atan2(Math.sin(heading - facing), Math.cos(heading - facing));
  const arc = (request.surface === 'instep' ? 0.5 : 2.8) * (0.55 + ready * 0.45);
  const presentedHeading = facing + clamp(alignmentError, -arc, arc);
  const elevation = clamp(
    Math.atan2(nominalNormal.z, Math.hypot(nominalNormal.x, nominalNormal.y)),
    -0.65,
    0.65,
  );
  const presented = {
    x: Math.cos(presentedHeading) * Math.cos(elevation),
    y: Math.sin(presentedHeading) * Math.cos(elevation),
    z: Math.sin(elevation),
  };
  const lateral = { x: -Math.sin(presentedHeading), y: Math.cos(presentedHeading), z: 0 };
  const up = {
    x: -Math.cos(presentedHeading) * Math.sin(elevation),
    y: -Math.sin(presentedHeading) * Math.sin(elevation),
    z: Math.cos(elevation),
  };
  const capability = activeStrikeCapability(actor, foot, balance, preparationSeconds);
  const inverseMass = 1 / FOOT_CONTACT_PHYSICS.mass + 1 / capability.effectiveMass;
  const closingSpeed =
    (FOOT_CONTACT_PHYSICS.mass * Math.hypot(change.x, change.y, change.z) * inverseMass) /
    (1 + capability.restitution);
  const normalFootSpeed = dot(incoming, presented) + closingSpeed;
  const nominalFootVelocity = {
    x: presented.x * normalFootSpeed + incoming.x - presented.x * dot(incoming, presented),
    y: presented.y * normalFootSpeed + incoming.y - presented.y * dot(incoming, presented),
    z: presented.z * normalFootSpeed + incoming.z - presented.z * dot(incoming, presented),
  };
  const episode = `${state.seed}:kick-contact-v1:${state.decisionIndex}:${actor.id}`;
  const rng = RandomGenerator.fromSeed(episode);
  // Same three latent draws for all skill/context arms. Timing couples patch and effort.
  const lateralDraw = gaussian(rng),
    timingDraw = gaussian(rng),
    effortDraw = gaussian(rng);
  const contextDemand = 1 + (1 - ready) * 1.5 + (1 - balance) + weak * 0.5;
  const patchSigma = (0.0007 + (1 - skill) ** 2 * 0.006) * contextDemand;
  // Explicit proximity/composure heuristic changes timing jitter; physical obstruction above
  // separately limits preparation/capability. Neither term changes flight after contact.
  const timingSigma =
    (0.001 + (1 - a.technique / 100) * 0.005) *
    (1 + pressure * (1 - a.composure / 100)) *
    contextDemand;
  const timingSeconds = timingDraw * timingSigma;
  const perturbation = kickPerturbationSchema.parse(
    perturbationOverride ?? {
      lateralPatchMetres: lateralDraw * patchSigma + timingSeconds * 0.12,
      verticalPatchMetres: timingSeconds * 0.2,
      timingSeconds,
      effortError: effortDraw * (0.012 + (1 - skill) ** 2 * 0.14) + timingSeconds * 1.5,
    },
  );
  // Spherical patch geometry r=-R*n. Small displacement rotates the contact normal,
  // while the swing retains its own direction: obliquity creates Coulomb-limited spin.
  const radius = FOOT_CONTACT_PHYSICS.radius;
  const normal = unit({
    x:
      presented.x -
      (lateral.x * perturbation.lateralPatchMetres) / radius -
      (up.x * perturbation.verticalPatchMetres) / radius,
    y:
      presented.y -
      (lateral.y * perturbation.lateralPatchMetres) / radius -
      (up.y * perturbation.verticalPatchMetres) / radius,
    z: presented.z - (up.z * perturbation.verticalPatchMetres) / radius,
  });
  const effort = clamp(1 + perturbation.effortError, 0, 2);
  const attemptedFootVelocity = {
    x: actor.velocity.x + (nominalFootVelocity.x - actor.velocity.x) * effort,
    y: actor.velocity.y + (nominalFootVelocity.y - actor.velocity.y) * effort,
    z: nominalFootVelocity.z * effort,
  };
  const relative = {
    x: attemptedFootVelocity.x - actor.velocity.x,
    y: attemptedFootVelocity.y - actor.velocity.y,
    z: attemptedFootVelocity.z,
  };
  const footScale = Math.min(
    1,
    capability.maximumFootSpeed / Math.max(1e-9, Math.hypot(relative.x, relative.y, relative.z)),
  );
  const realisedFootVelocity = {
    x: actor.velocity.x + relative.x * footScale,
    y: actor.velocity.y + relative.y * footScale,
    z: relative.z * footScale,
  };
  const contact = executeFootContact(state, actor, {
    intended: request.surface,
    foot,
    desiredVelocity: request.nominalVelocity,
    balance,
    preparationSeconds,
    contactSeconds: 0.025,
    pressure: 0,
    activeStrike: { normal, footVelocity: realisedFootVelocity },
  });
  return kickExecutionReceiptSchema.parse({
    version: 'contact-v1',
    episode,
    actorId: actor.id,
    at: state.time,
    family: request.family,
    intendedTarget: request.target,
    nominalVelocity: request.nominalVelocity,
    nominalSpin: state.ball.spin ?? zero(),
    nominalFootVelocity,
    realisedFootVelocity,
    nominalNormal,
    effectiveNormal: normal,
    capability,
    angularImpulse: {
      x: (contact.outgoingSpin.x - contact.incomingSpin.x) * FOOT_CONTACT_PHYSICS.inertia,
      y: (contact.outgoingSpin.y - contact.incomingSpin.y) * FOOT_CONTACT_PHYSICS.inertia,
      z: (contact.outgoingSpin.z - contact.incomingSpin.z) * FOOT_CONTACT_PHYSICS.inertia,
    },
    perturbation,
    body: { position: actor.position, velocity: actor.velocity, facingAngle: actor.facingAngle },
    context: {
      skill,
      pressure,
      preparationSeconds,
      obstructionTime: Number.isFinite(obstructionTime) ? obstructionTime : null,
      balance,
      alignmentError: Math.abs(alignmentError),
      weakFootDeficit: weak,
    },
    contact,
  });
};

export const eligiblePhysicalPass = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: {
    firstTime?: boolean | undefined;
    delivery?: string | undefined;
    distribution?: string | undefined;
  },
) =>
  state.experimentalKickExecution === 'contact-v1' &&
  state.scenario === 'open_play' &&
  !state.restart &&
  state.ball.ownerId === actor.id &&
  !state.ball.travelKind &&
  !action.firstTime &&
  action.delivery !== 'lofted' &&
  !action.distribution &&
  (state.ball.height ?? 0) <= 0.24;

export const eligiblePhysicalShot = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  action: {
    type: string;
    intent?: string | undefined;
    contact?: string | undefined;
    freeKickProfile?: string | undefined;
  },
) =>
  state.experimentalKickExecution === 'contact-v1' &&
  state.scenario === 'open_play' &&
  !state.restart &&
  action.type === 'shot' &&
  action.intent !== 'chip' &&
  !action.freeKickProfile &&
  (!action.contact || action.contact === 'settled') &&
  state.ball.ownerId === actor.id &&
  !state.ball.travelKind &&
  (state.ball.height ?? 0) <= 0.24;
