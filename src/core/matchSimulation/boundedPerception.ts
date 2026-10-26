import { z } from 'zod';
import { opponentMemorySchema } from './opponentKnowledge';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { attacksRight, clampPitchPoint, distance, physicalPointSchema } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { RandomGenerator } from '../random/RandomGenerator';
import { tacticalRoleFor } from './tacticalRoles';
import { playerAttributesSchema, hiddenPlayerProfileSchema } from '../../schemas/domainSchemas';
import { canReleaseControlledAction } from './decisionReadiness';
import { rememberedGeometry, spatialSightingSchema } from './activePerceptionState';
import { deriveMovementCapability, movementCapabilitySchema } from './locomotion';
import {
  boundedExperimentSchema,
  boundedIntentSchema,
  boundedPatternSchema,
} from './boundedIntelligenceState';

const unit = z.number().min(0).max(1);
export const boundedSceneSchema = z.object({
  attention: z.number().optional(),
  remembered: spatialSightingSchema.array().max(12).optional(),
  knowledge: z
    .array(
      z.object({
        id: z.string(),
        observedAt: z.number(),
        uncertainty: z.number().nonnegative(),
        confidence: unit,
        source: z.enum(['current', 'remembered', 'predicted']),
      }),
    )
    .max(22)
    .optional(),
  transitionExperiment: z.boolean().optional(),
  observerId: z.string(),
  team: z.enum(['home', 'away']),
  at: z.number(),
  direction: z.union([z.literal(1), z.literal(-1)]),
  position: physicalPointSchema,
  velocity: physicalPointSchema,
  facing: z.number(),
  role: z.string(),
  instructions: z.string().array(),
  attributes: playerAttributesSchema,
  adaptability: hiddenPlayerProfileSchema.shape.adaptability,
  confidence: unit,
  fatigue: unit,
  capability: movementCapabilitySchema,
  ball: z
    .object({
      position: physicalPointSchema,
      height: z.number(),
      velocity: z.object({ x: z.number(), y: z.number(), z: z.number() }),
      ownerId: z.string().nullable(),
    })
    .nullable(),
  visible: z
    .array(
      z.object({
        id: z.string(),
        team: z.enum(['home', 'away']),
        position: physicalPointSchema,
        velocity: physicalPointSchema,
        keeper: z.boolean(),
        role: z.string().nullable(),
        preparing: z.boolean(),
        facing: z.number().optional(),
      }),
    )
    .max(22),
  contactReady: z.boolean(),
  readyAt: z.number(),
  gainedAt: z.number(),
  lastTouchAt: z.number().nullable(),
  scoreDifference: z.number(),
  regainAge: z.number(),
  signature: z.string(),
  config: boundedExperimentSchema,
  intent: boundedIntentSchema.nullable(),
  patterns: boundedPatternSchema.array().max(22),
  opponents: opponentMemorySchema.default({}),
  observedContact: z.object({ actorId: z.string(), key: z.string() }).nullable().default(null),
  ownForm: z.number().min(-1).max(1).default(0),
  selfFeedback: z
    .object({ key: z.string(), value: z.number().min(-1).max(1) })
    .nullable()
    .default(null),
});
export type BoundedScene = z.infer<typeof boundedSceneSchema>;

/** Available knowledge, with original ages in scene.knowledge; never unseen truth. */
export const knownBoundedPlayers = (s: BoundedScene) => [
  ...s.visible,
  ...(s.remembered ?? []).filter((p) => !s.visible.some((v) => v.id === p.id)),
];

/** The ONLY truth-reading adapter for the new on-ball candidate/policy path.
 * Copies whitelisted fields. No world reference, seed, RNG state, opponent ratings,
 * target/intent, opposition tactics, global pressure or precomputed action values cross it.
 * 100ms sample buckets prevent jitter changing with policy evaluation frequency.
 * Visibility is simplified (no body occlusion or persistent sightings yet).
 */
export const observeBoundedScene = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
  directOnly = false,
): BoundedScene => {
  const active = state.experimentalActivePerception;
  const memory = active ? state.activePerceptionRuntime?.memory[actor.id] : undefined;
  const cached = active && !directOnly && memory !== undefined;
  const known = rememberedGeometry(
    memory,
    state.time,
    actor.profile.attributes.concentration,
    actor.profile.attributes.gameReading,
  );
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:pr187:observation:${actor.id}:${Math.floor(state.time * 10 + 1e-6)}`,
  );
  const sees = (p: { x: number; y: number }) => {
    const d = distance(actor.position, p);
    return (
      d <= 36 &&
      ((!active && d < 7) ||
        Math.abs(
          normalizeAngle(
            angleForVector({ x: p.x - actor.position.x, y: p.y - actor.position.y }) -
              (active ? (memory?.gaze ?? actor.facingAngle) : actor.facingAngle),
          ),
        ) < (active ? 1.22 : 1.92))
    );
  };
  const visible = cached
    ? known.filter((p) => p.source === 'current')
    : state.players
        .filter((p) => p.id !== actor.id && sees(p.position) && !state.discipline?.[p.id]?.sentOff)
        .map((p) => ({
          id: p.id,
          team: p.team,
          position: clampPitchPoint({
            x: p.position.x + (rng.float() - 0.5) * 0.3,
            y: p.position.y + (rng.float() - 0.5) * 0.3,
          }),
          velocity: { ...p.velocity },
          keeper: p.slot.position === 'goalkeeper',
          ...(state.experimentalTransitionIntelligence ? { facing: p.facingAngle } : {}),
          role: p.team === actor.team ? tacticalRoleFor(state, p).id : null,
          // A coarse visible body-set cue, never its private chosen action or exact clock.
          preparing:
            p.team === actor.team &&
            state.onBallPreparation?.actorId === p.id &&
            state.onBallPreparation.readyAt > state.time,
        }));
  const ballVisible =
    state.ball.ownerId === actor.id ||
    (cached ? memory.ball !== null && state.time - memory.ballSeenAt <= 0.35 : sees(state.ball));
  const last = state.lastGroundContact?.actorId === actor.id ? state.lastGroundContact.at : null;
  const prep = state.onBallPreparation?.actorId === actor.id ? state.onBallPreparation : null;
  const role = tacticalRoleFor(state, actor);
  return boundedSceneSchema.parse({
    ...(active
      ? {
          attention: memory?.gaze ?? actor.facingAngle,
          remembered:
            cached && state.activePerceptionConfig?.memory !== false
              ? known.filter((p) => p.source !== 'current')
              : [],
          knowledge: cached
            ? known.map((p) => ({
                id: p.id,
                observedAt: p.observedAt,
                uncertainty: p.uncertainty,
                confidence: p.confidence,
                source: p.source,
              }))
            : visible.map((p) => ({
                id: p.id,
                observedAt: state.time,
                uncertainty: 0.15,
                confidence: 0.9,
                source: 'current',
              })),
        }
      : {}),
    ...(state.experimentalTransitionIntelligence ? { transitionExperiment: true } : {}),
    observerId: actor.id,
    team: actor.team,
    at: state.time,
    direction: attacksRight(actor) ? 1 : -1,
    position: { ...actor.position },
    velocity: { ...actor.velocity },
    facing: actor.facingAngle,
    role: role.id,
    instructions: [...role.instructions],
    attributes: actor.profile.attributes,
    adaptability: actor.profile.hiddenProfile.adaptability,
    confidence: (actor.profile.attributes.composure + actor.profile.attributes.determination) / 200,
    fatigue: 1 - (actor.fitness?.longTermCapacity ?? 1),
    capability: deriveMovementCapability(actor),
    ball: ballVisible
      ? cached && state.ball.ownerId !== actor.id
        ? memory.ball
        : {
            position: { x: state.ball.x, y: state.ball.y },
            height: state.ball.height ?? 0,
            velocity: {
              x: state.ball.velocity?.x ?? 0,
              y: state.ball.velocity?.y ?? 0,
              z: state.ball.velocity?.z ?? 0,
            },
            ownerId:
              state.ball.ownerId === actor.id || visible.some((p) => p.id === state.ball.ownerId)
                ? (state.ball.ownerId ?? null)
                : null,
          }
      : null,
    visible,
    contactReady: ballVisible && canReleaseControlledAction(state, actor),
    readyAt: prep?.readyAt ?? state.ballOwnershipStartedAt ?? state.time,
    gainedAt: prep?.gainedAt ?? state.time,
    lastTouchAt: last,
    scoreDifference: state.score[actor.team] - state.score[actor.team === 'home' ? 'away' : 'home'],
    // A recent personally observed turnover is not remembered in this first adapter.
    regainAge:
      state.boundedRuntime?.sightings[actor.id]?.regainedAt !== null &&
      state.boundedRuntime?.sightings[actor.id]?.regainedAt !== undefined
        ? Math.max(0, state.time - state.boundedRuntime.sightings[actor.id]!.regainedAt!)
        : 100,
    signature: JSON.stringify([role.id, state.teams[actor.team].tacticalPreferences ?? null]),
    config: state.boundedExperiment ?? {},
    intent: state.boundedRuntime?.intent?.actorId === actor.id ? state.boundedRuntime.intent : null,
    patterns: Object.values(state.boundedRuntime?.patterns ?? {})
      .filter((p) => p.actorId === actor.id)
      .map((p) => ({ ...p })),
    opponents: state.boundedRuntime?.opponents?.[actor.id] ?? {},
    ownForm: state.boundedRuntime?.selfEvidence?.[actor.id]?.value ?? 0,
    selfFeedback:
      state.lastResolvedPass?.passerId === actor.id &&
      state.lastResolvedPass.finalResult &&
      state.lastResolvedPass.actualReceiverId &&
      visible.some((p) => p.id === state.lastResolvedPass!.actualReceiverId)
        ? {
            key: state.lastResolvedPass.passId,
            value: state.lastResolvedPass.finalResult === 'completed' ? 1 : -1,
          }
        : prep?.receptionKind
          ? {
              key: `reception:${prep.gainedAt}`,
              value: prep.receptionKind === 'heavy_touch' ? -0.5 : 0.5,
            }
          : null,
    observedContact:
      state.lastGroundContact && visible.some((p) => p.id === state.lastGroundContact!.actorId)
        ? {
            actorId: state.lastGroundContact.actorId,
            key: `${state.lastGroundContact.actorId}:${state.lastGroundContact.at}`,
          }
        : null,
  });
};
