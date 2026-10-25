import { z } from 'zod';
import { footballerProfileSchema } from '../../schemas/domainSchemas';
import type { FootballerProfile } from '../../types/domain';
import type { MatchPlayerState } from './matchState';
import { makeLabState, footballSkillTrialConfigSchema } from './footballPerformanceLab';
import { labLauncherSchema, labVectorSchema as vector } from './footballLabObjects';
import { RandomGenerator } from '../random/RandomGenerator';
import { integrateCanonicalMovement } from './canonicalMovement';
import {
  advanceMatchFitness,
  createMatchFitness,
  recordPhysicalContactFitness,
} from './matchFitness';
import { deriveMovementCapability } from './locomotion';
import { constrainCompliantBodyStep, lowerBodyPoseSchema } from './lowerBodyGeometry';
import { angleForVector } from './playerOrientation';
import { distance, physicalPointSchema } from './matchSpace';
import { ballSpinSchema, type PhysicalBall } from './ballPhysics';
import { playerFootGeometry, footSurfaceSchema } from './footContact';
import { applyCanonicalBallControl } from './matchSimulation';
import { resolveMatchAction } from './matchActions';
import {
  advanceSurfaceBall,
  ballSurfaceSchema,
  surfaceContactReceiptSchema,
  surfaceRequestSchema,
  sweepSurface,
  receiptFromFootContact,
  type SurfaceRequest,
} from './ballSurfaceContact';

const DT = 0.025;
export const firstTouchLabConfigSchema = z
  .object({
    id: z.string().min(1),
    family: z.enum(['reception', 'directional', 'one_touch', 'juggling']),
    mode: z.enum(['prescribed', 'autonomous', 'manual']).default('prescribed'),
    surface: ballSurfaceSchema.default('cushion'),
    manualSurface: ballSurfaceSchema.optional(),
    foot: z.enum(['left', 'right']).default('right'),
    sequence: z.array(ballSurfaceSchema).max(10).default([]),
    alternateFeet: z.boolean().default(false),
    touches: z.union([z.literal(2), z.literal(5), z.literal(10)]).default(5),
    objective: z.enum(['settle', 'directional', 'pass', 'shot', 'juggle']).default('settle'),
    launcher: labLauncherSchema,
    position: physicalPointSchema.default({ x: 20, y: 34 }),
    bodyVelocity: physicalPointSchema.default({ x: 0, y: 0 }),
    facingAngle: z
      .number()
      .finite()
      .default(-Math.PI / 2),
    pose: lowerBodyPoseSchema.optional(),
    target: physicalPointSchema.default({ x: 28, y: 34 }),
    desiredSpeed: z.number().nonnegative().max(40).default(3),
    desiredLift: z.number().min(-5).max(8).default(0),
    awarenessAt: z.number().finite().default(-0.3),
    condition: z.number().min(1).max(100).default(100),
    defender: z.enum(['none', 'passive', 'active']).default('none'),
    defenderPosition: physicalPointSchema.default({ x: 23, y: 35.2 }),
    defenderReaction: z.number().nonnegative().default(0.25),
    maximumSeconds: z.number().positive().max(20).default(6),
  })
  .superRefine((c, ctx) => {
    if (c.mode === 'manual' && !c.manualSurface)
      ctx.addIssue({ code: 'custom', message: 'manualSurface is required in manual mode' });
  });
export type FirstTouchLabConfig = z.infer<typeof firstTouchLabConfigSchema>;
export const firstTouchLabSampleSchema = z.object({
  at: z.number(),
  ball: vector,
  velocity: vector,
  spin: ballSpinSchema,
  player: physicalPointSchema,
  playerVelocity: physicalPointSchema,
  facing: z.number(),
  balance: z.number(),
  capacity: z.number(),
  owner: z.string().nullable(),
  defender: physicalPointSchema.nullable(),
});
export const firstTouchLabResultSchema = z.object({
  schema: z.literal('mfl-first-touch-lab-v1'),
  stepSeconds: z.literal(0.025),
  seed: z.string(),
  input: z.object({ config: firstTouchLabConfigSchema, player: footballerProfileSchema }),
  contacts: z.array(surfaceContactReceiptSchema),
  choices: z.array(
    z.object({
      at: z.number(),
      surface: ballSurfaceSchema,
      foot: z.enum(['left', 'right']),
      available: z.boolean(),
    }),
  ),
  samples: z.array(firstTouchLabSampleSchema),
  metrics: z.object({
    physicalContacts: z.number(),
    actorContacts: z.number(),
    firstContactSpeed: z.number().nullable(),
    firstRequestedVelocity: vector.nullable(),
    directionErrorRadians: z.number().nullable(),
    speedError: z.number().nullable(),
    nextContactSeconds: z.number().nullable(),
    nextContactDistance: z.number().nullable(),
    finalSeparation: z.number(),
    controlAt: z.number().nullable(),
    controlledBy: z.string().nullable(),
    nextOrdinaryAction: z.boolean(),
    receiverContact: z.boolean(),
    goal: z.boolean(),
    defenderContact: z.boolean(),
    spaceGained: z.number(),
    repositioningMetres: z.number(),
    apex: z.number(),
    bounces: z.number(),
    fatigueSpent: z.number(),
  }),
  status: z.enum(['completed', 'failed', 'incomplete']),
  reason: z.string(),
});
export type FirstTouchLabResult = z.infer<typeof firstTouchLabResultSchema>;
const zero = () => ({ x: 0, y: 0, z: 0 });
const speed = (v: { x: number; y: number; z?: number }) => Math.hypot(v.x, v.y, v.z ?? 0);

/** Observation-only local surface selection. No projected outcome, opponent ratings
 * or seed-dependent success score is available to this controller. */
export const selectObservedSurface = (
  p: MatchPlayerState,
  b: PhysicalBall,
  objective: SurfaceRequest['objective'],
): SurfaceRequest['intendedSurface'] => {
  if (b.position.z <= 0.65)
    return objective === 'settle' || objective === 'juggle' ? 'cushion' : 'inside';
  if (b.position.z <= (p.profile.heightCm / 100) * 0.56 && p.lowerBodyPose) return 'thigh';
  if (b.position.z <= (p.profile.heightCm / 100) * 0.88) return 'chest';
  return 'head';
};
const move = (
  p: MatchPlayerState,
  target: { x: number; y: number },
  pace: number,
  all: MatchPlayerState[],
  contactLoad = 0,
  facing?: number,
) => {
  const before = p.position;
  const m = integrateCanonicalMovement(p, {
    target,
    targetSpeed: pace,
    desiredFacingAngle:
      facing ??
      (distance(before, target) > 0.15
        ? angleForVector({ x: target.x - before.x, y: target.y - before.y })
        : p.facingAngle),
    dt: DT,
    balance: p.plantBalance?.balance ?? 1,
    structural: false,
    receivingMomentum: false,
  });
  let position = m.position;
  for (const other of all)
    if (other.id !== p.id) position = constrainCompliantBodyStep(p, position, other, DT);
  const actual = { x: (position.x - before.x) / DT, y: (position.y - before.y) / DT };
  return {
    ...p,
    position,
    velocity: actual,
    facingAngle: m.facingAngle,
    plantBalance: m.plantBalance,
    fitness: advanceMatchFitness(p, {
      dt: DT,
      distance: distance(before, position),
      speed: speed(actual),
      previousSpeed: speed(p.velocity),
      turnRadians: Math.abs(
        Math.atan2(
          Math.sin(m.facingAngle - p.facingAngle),
          Math.cos(m.facingAngle - p.facingAngle),
        ),
      ),
      sprinting: speed(actual) > m.capability.maximumSprintSpeed * 0.8,
      sprintBurst: false,
      bodyContactLoad: contactLoad,
    }),
  };
};

/** Launcher placement occurs once at release, before any simulated flight. All subsequent
 * states use the ordinary 40Hz integrator, finite movement and the shared contact solver. */
export const runFirstTouchLab = (
  raw: z.input<typeof firstTouchLabConfigSchema>,
  profile: FootballerProfile,
  seed: string,
  observer?: (sample: z.infer<typeof firstTouchLabSampleSchema>) => void,
): FirstTouchLabResult => {
  const c = firstTouchLabConfigSchema.parse(raw),
    player = footballerProfileSchema.parse(structuredClone(profile));
  const state = makeLabState(
    player,
    footballSkillTrialConfigSchema.parse({
      id: c.id,
      drill: 'receive',
      position: c.position,
      initialVelocity: c.bodyVelocity,
      facingAngle: c.facingAngle,
    }),
    seed,
  );
  let actor: MatchPlayerState = {
    ...state.players[0]!,
    fitness: createMatchFitness(c.condition),
    ...(c.pose ? { lowerBodyPose: c.pose } : {}),
  };
  const teammate = {
    ...structuredClone(actor),
    id: actor.id + ':receiver',
    profile: { ...player, id: player.id + ':receiver' },
    position: { ...c.target },
    target: { ...c.target },
    velocity: { x: 0, y: 0 },
  };
  const defender = {
    ...structuredClone(actor),
    id: actor.id + ':defender',
    profile: { ...player, id: player.id + ':defender' },
    team: 'away' as const,
    position: { ...c.defenderPosition },
    target: { ...c.defenderPosition },
    velocity: { x: 0, y: 0 },
  };
  state.players = [
    actor,
    ...(c.objective === 'pass' ? [teammate] : []),
    ...(c.defender === 'none' ? [] : [defender]),
  ];
  const rng = RandomGenerator.fromSeed(seed + ':launcher'),
    spread = () => c.launcher.dispersion * (rng.float() * 2 - 1);
  let ball: PhysicalBall = {
    position: { ...c.launcher.position },
    velocity: {
      x: c.launcher.velocity.x + spread(),
      y: c.launcher.velocity.y + spread(),
      z: c.launcher.velocity.z + spread(),
    },
    spin: { ...c.launcher.spin },
    airborne: c.launcher.position.z > 0.11 || c.launcher.velocity.z > 0,
    bounceCount: 0,
  };
  const contacts: FirstTouchLabResult['contacts'] = [],
    choices: FirstTouchLabResult['choices'] = [],
    samples: FirstTouchLabResult['samples'] = [];
  const ready = new Map<string, number>(),
    locked = new Set<string>();
  let released = false,
    controlAt: number | null = null,
    controlledBy: string | null = null,
    nextOrdinaryAction = false,
    goal = false,
    reason = 'time_limit',
    repositioning = 0,
    apex = ball.position.z;
  let lastChoice = '';
  let firstRequestedVelocity: SurfaceRequest['desiredVelocity'] | null = null;
  for (let tick = 0; tick < Math.ceil(c.maximumSeconds / DT); tick++) {
    state.time = tick * DT;
    if (state.time + 1e-9 < c.launcher.releaseAt) continue;
    released = true;
    const before = state.players;
    const actorCount = contacts.filter((v) => v.playerId === actor.id).length;
    const seenAt =
      c.mode === 'autonomous'
        ? Math.max(
            c.awarenessAt,
            c.launcher.releaseAt + 0.08 + (100 - player.attributes.gameReading) * 0.003,
          )
        : c.awarenessAt;
    const aware = state.time >= seenAt;
    state.players = before.map((p) => {
      const isActor = p.id === actor.id,
        isDefender = p.team === 'away';
      const active = isActor
        ? aware
        : isDefender
          ? c.defender === 'active' && state.time >= c.launcher.releaseAt + c.defenderReaction
          : true;
      const target =
        isActor && c.family === 'juggling'
          ? {
              x: ball.position.x - Math.sin(c.facingAngle) * 0.55,
              y: ball.position.y - Math.cos(c.facingAngle) * 0.55,
            }
          : isActor && actorCount > 0 && c.family === 'directional'
            ? c.target
            : { x: ball.position.x, y: ball.position.y };
      return active
        ? move(
            p,
            target,
            deriveMovementCapability(p).maximumSprintSpeed,
            before,
            0,
            isActor && c.family === 'juggling' ? c.facingAngle : undefined,
          )
        : move(p, p.position, 0, before);
    });
    actor = state.players[0]!;
    const direction = { x: c.target.x - ball.position.x, y: c.target.y - ball.position.y },
      len = Math.max(0.001, Math.hypot(direction.x, direction.y));
    let surface =
      c.mode === 'manual'
        ? c.manualSurface!
        : c.mode === 'autonomous'
          ? selectObservedSurface(actor, ball, c.objective)
          : c.sequence.length
            ? c.sequence[Math.min(actorCount, c.sequence.length - 1)]!
            : c.surface;
    if (c.family === 'reception' && actorCount > 0 && ball.position.z <= 0.65) surface = 'cushion';
    const foot =
      c.alternateFeet && actorCount % 2 ? (c.foot === 'right' ? 'left' : 'right') : c.foot;
    const desired =
      c.objective === 'settle'
        ? { ...actor.velocity, z: 0 }
        : c.objective === 'juggle'
          ? { ...actor.velocity, z: c.desiredLift || 3 }
          : {
              x: (direction.x / len) * c.desiredSpeed,
              y: (direction.y / len) * c.desiredSpeed,
              z: c.desiredLift,
            };
    const request = surfaceRequestSchema.parse({
      objective: c.objective,
      intendedSurface: surface,
      foot,
      desiredVelocity: desired,
      preparationSeconds: Math.max(0, state.time - seenAt),
      readyAt: ready.get(actor.id) ?? 0,
    });
    if (lastChoice !== surface + foot) {
      choices.push({
        at: state.time,
        surface,
        foot,
        available: !['head', 'overhead'].includes(surface),
      });
      lastChoice = surface + foot;
    }
    const candidates = state.players.flatMap((p, i) => {
      const own = p.id === actor.id;
      const active = !(
        own &&
        (!aware ||
          (c.family === 'one_touch' && actorCount > 0) ||
          (c.family === 'juggling' && ball.velocity.z >= 0))
      );
      const r = own
        ? request
        : surfaceRequestSchema.parse({
            objective: p.team === 'away' ? 'deflect' : 'settle',
            intendedSurface: selectObservedSurface(p, ball, 'settle'),
            foot: 'right',
            desiredVelocity: { ...p.velocity, z: 0 },
            preparationSeconds: Math.max(0, state.time - c.launcher.releaseAt),
            readyAt: ready.get(p.id) ?? 0,
          });
      if (locked.has(p.id)) {
        const still = sweepSurface(ball, ball, p, p, r, 0);
        if (!still) locked.delete(p.id);
        else return [];
      }
      if (state.time + DT < r.readyAt) return [];
      const entries = active ? [{ player: p, previous: before[i]!, request: r, intention: r }] : [];
      for (const surface of ['chest', ...(p.lowerBodyPose ? ['thigh', 'knee', 'lower_leg'] : [])]) {
        if (surface !== r.intendedSurface)
          entries.push({
            player: p,
            previous: before[i]!,
            intention: r,
            request: surfaceRequestSchema.parse({
              ...r,
              intendedSurface: surface,
              desiredVelocity: { ...p.velocity, z: 0 },
              preparationSeconds: 0,
            }),
          });
      }
      return entries;
    });
    const step = advanceSurfaceBall(state, ball, DT, candidates, c.objective === 'shot');
    ball = { ...step.ball, spin: step.ball.spin ?? zero() };
    for (const contact of step.contacts) {
      if (contact.playerId === actor.id && firstRequestedVelocity === null)
        firstRequestedVelocity = { ...request.desiredVelocity };
      contacts.push(contact);
      locked.add(contact.playerId);
      ready.set(contact.playerId, contact.at + Math.max(0.12, contact.recoverySeconds));
      state.players = state.players.map((p) =>
        p.id === contact.playerId
          ? recordPhysicalContactFitness(p, Math.min(1, speed(contact.impulse) / 8), DT)
          : p,
      );
    }
    state.time = (tick + 1) * DT;
    state.ball = {
      x: ball.position.x,
      y: ball.position.y,
      height: ball.position.z,
      velocity: ball.velocity,
      spin: ball.spin ?? zero(),
      lastTouchPlayerId: contacts.at(-1)?.playerId ?? 'lab-launcher',
      airborne: ball.airborne,
      bounceCount: ball.bounceCount,
      travelKind: 'pass',
    };
    // A subsequent low, slow, reachable foot opportunity permits the ordinary
    // canonical control gate. No acquisition lottery chooses the laboratory result.
    if (
      c.family !== 'juggling' &&
      contacts.length &&
      !step.contacts.length &&
      ball.position.z < 0.5
    ) {
      const claimant = state.players
        .filter((p) => {
          const feet = playerFootGeometry(p);
          const prior = [...contacts].reverse().find((v) => v.playerId === p.id);
          return (
            state.time >= (ready.get(p.id) ?? 0) &&
            prior &&
            footSurfaceSchema.safeParse(prior.actualSurface).success &&
            Math.min(distance(feet.leftFoot, state.ball), distance(feet.rightFoot, state.ball)) <=
              feet.footReach &&
            Math.hypot(ball.velocity.x - p.velocity.x, ball.velocity.y - p.velocity.y) < 1.5 &&
            Math.abs(ball.velocity.z) < 1
          );
        })
        .sort((a, b) => distance(a.position, state.ball) - distance(b.position, state.ball))[0];
      if (claimant) {
        const controlled = applyCanonicalBallControl(state, claimant.id);
        const fc = controlled.lastGroundContact?.surfaceContact;
        if (fc && fc.at === state.time && fc.available) {
          const receipt = receiptFromFootContact(claimant.id, 'settle', fc);
          receipt.controlEstablished = controlled.ball.ownerId === claimant.id;
          receipt.loose = !receipt.controlEstablished;
          contacts.push(receipt);
        }
        if (controlled.ball.ownerId === claimant.id) {
          controlAt = state.time;
          controlledBy = claimant.id;
          const action = resolveMatchAction(controlled, {
            type: 'carry',
            actorId: claimant.id,
            target: {
              x: Math.min(104, Math.max(1, controlled.ball.x + 2)),
              y: Math.min(67, Math.max(1, controlled.ball.y)),
            },
          });
          nextOrdinaryAction = action.decisionIndex > controlled.decisionIndex;
          reason =
            controlledBy === actor.id
              ? 'controlled'
              : controlledBy === teammate.id
                ? 'receiver_controlled'
                : 'defender_controlled';
          break;
        }
      }
    }
    if (
      c.objective === 'shot' &&
      contacts.some((v) => v.playerId === actor.id) &&
      step.goalCrossing
    ) {
      goal = true;
      reason = 'goal_crossing';
    }
    apex = Math.max(apex, ball.position.z);
    repositioning += distance(before[0]!.position, actor.position);
    if (tick % 4 === 0 || step.contacts.length) {
      const sample = {
        at: state.time,
        ball: { ...ball.position },
        velocity: { ...ball.velocity },
        spin: { ...(ball.spin ?? zero()) },
        player: { ...actor.position },
        playerVelocity: { ...actor.velocity },
        facing: actor.facingAngle,
        balance: actor.plantBalance?.balance ?? 1,
        capacity: actor.fitness?.longTermCapacity ?? 1,
        owner: state.ball.ownerId ?? null,
        defender: state.players.find((p) => p.team === 'away')?.position ?? null,
      };
      samples.push(structuredClone(sample));
      observer?.(structuredClone(sample));
    }
    if (goal) break;
    if (
      c.family === 'juggling' &&
      c.mode !== 'autonomous' &&
      step.contacts.some(
        (contact) =>
          contact.playerId === actor.id && contact.actualSurface !== contact.intendedSurface,
      )
    ) {
      reason = 'sequence_mismatch';
      break;
    }
    if (
      ball.position.x < -0.11 ||
      ball.position.x > 105.11 ||
      ball.position.y < -0.11 ||
      ball.position.y > 68.11
    ) {
      reason = 'out_of_play';
      break;
    }
    if (
      c.family === 'juggling' &&
      contacts.filter((v) => v.playerId === actor.id).length >= c.touches
    ) {
      reason = 'sequence_completed';
      break;
    }
    if (c.family === 'juggling' && ball.bounceCount > 0) {
      reason = 'ground_contact';
      break;
    }
  }
  const own = contacts.filter((v) => v.playerId === actor.id),
    first = own[0],
    second = own[1];
  const wanted = firstRequestedVelocity ?? zero();
  const realised = first?.outgoingVelocity;
  const directionError =
    realised && Math.hypot(realised.x, realised.y) > 1e-6 && Math.hypot(wanted.x, wanted.y) > 1e-6
      ? Math.abs(
          Math.atan2(
            Math.sin(Math.atan2(realised.y, realised.x) - Math.atan2(wanted.y, wanted.x)),
            Math.cos(Math.atan2(realised.y, realised.x) - Math.atan2(wanted.y, wanted.x)),
          ),
        )
      : null;
  return firstTouchLabResultSchema.parse({
    schema: 'mfl-first-touch-lab-v1',
    stepSeconds: DT,
    seed,
    input: { config: c, player },
    contacts,
    choices,
    samples,
    metrics: {
      physicalContacts: contacts.length,
      actorContacts: own.length,
      firstContactSpeed: first ? speed(first.outgoingVelocity) : null,
      firstRequestedVelocity,
      directionErrorRadians: directionError,
      speedError:
        first && firstRequestedVelocity
          ? speed(first.outgoingVelocity) - speed(firstRequestedVelocity)
          : null,
      nextContactSeconds: second && first ? second.at - first.at : null,
      nextContactDistance: second && first ? distance(second.point, first.point) : null,
      finalSeparation: distance(actor.position, ball.position),
      controlAt,
      controlledBy,
      nextOrdinaryAction,
      receiverContact: contacts.some((v) => v.playerId === teammate.id),
      goal,
      defenderContact: contacts.some((v) => v.playerId === defender.id),
      spaceGained: distance(c.position, c.target) - distance(actor.position, c.target),
      repositioningMetres: repositioning,
      apex,
      bounces: ball.bounceCount,
      fatigueSpent: actor.fitness?.exertionSpent ?? 0,
    },
    status:
      c.mode !== 'autonomous' &&
      ['head', 'overhead'].includes(c.mode === 'manual' ? c.manualSurface! : c.surface)
        ? 'failed'
        : (
              c.objective === 'shot'
                ? goal
                : c.objective === 'pass'
                  ? controlledBy === teammate.id
                  : c.family === 'juggling'
                    ? reason === 'sequence_completed'
                    : controlledBy === actor.id
            )
          ? 'completed'
          : !released
            ? 'incomplete'
            : 'failed',
    reason: !released
      ? 'launcher_not_released'
      : c.mode !== 'autonomous' &&
          ['head', 'overhead'].includes(c.mode === 'manual' ? c.manualSurface! : c.surface)
        ? first
          ? 'surface_unavailable_incidental_contact'
          : 'surface_unavailable'
        : reason,
  });
};
