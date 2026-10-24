import { z } from 'zod';
import type { MatchPlayerState, TacticalMatchState } from './matchState';
import { attacksRight, clampPitchPoint, distance, physicalPointSchema } from './matchSpace';
import { angleForVector, normalizeAngle } from './playerOrientation';
import { RandomGenerator } from '../random/RandomGenerator';
import { tacticalRoleFor } from './tacticalRoles';
import { playerAttributesSchema, hiddenPlayerProfileSchema } from '../../schemas/domainSchemas';
import { playerContactGeometry } from './ballContactGeometry';
import { deriveMovementCapability, movementCapabilitySchema } from './locomotion';
import {
  boundedExperimentSchema,
  boundedIntentSchema,
  boundedPatternSchema,
} from './boundedIntelligenceState';

const unit = z.number().min(0).max(1);
export const boundedSceneSchema = z.object({
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
});
export type BoundedScene = z.infer<typeof boundedSceneSchema>;

/** The ONLY truth-reading adapter for the new on-ball candidate/policy path.
 * Copies whitelisted fields. No world reference, seed, RNG state, opponent ratings,
 * target/intent, opposition tactics, global pressure or precomputed action values cross it.
 * 100ms sample buckets prevent jitter changing with policy evaluation frequency.
 * Visibility is simplified (no body occlusion or persistent sightings yet).
 */
export const observeBoundedScene = (
  state: TacticalMatchState,
  actor: MatchPlayerState,
): BoundedScene => {
  const rng = RandomGenerator.fromSeed(
    `${state.seed}:pr187:observation:${actor.id}:${Math.floor(state.time * 10 + 1e-6)}`,
  );
  const sees = (p: { x: number; y: number }) => {
    const d = distance(actor.position, p);
    return (
      d <= 36 &&
      (d < 7 ||
        Math.abs(
          normalizeAngle(
            angleForVector({ x: p.x - actor.position.x, y: p.y - actor.position.y }) -
              actor.facingAngle,
          ),
        ) < 1.92)
    );
  };
  const visible = state.players
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
      role: p.team === actor.team ? tacticalRoleFor(state, p).id : null,
      // A coarse visible body-set cue, never its private chosen action or exact clock.
      preparing:
        p.team === actor.team &&
        state.onBallPreparation?.actorId === p.id &&
        state.onBallPreparation.readyAt > state.time,
    }));
  const ballVisible = state.ball.ownerId === actor.id || sees(state.ball);
  const feet = playerContactGeometry(actor);
  const last = state.lastGroundContact?.actorId === actor.id ? state.lastGroundContact.at : null;
  const prep = state.onBallPreparation?.actorId === actor.id ? state.onBallPreparation : null;
  const role = tacticalRoleFor(state, actor);
  return boundedSceneSchema.parse({
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
      ? {
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
    contactReady:
      ballVisible &&
      state.ball.ownerId === actor.id &&
      (state.ball.height ?? 0) <= 0.65 &&
      Math.min(distance(feet.leftFoot, state.ball), distance(feet.rightFoot, state.ball)) <=
        feet.footReach &&
      (last === null || state.time - last >= 0.12 - 1e-8),
    readyAt: prep?.readyAt ?? state.time,
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
  });
};
