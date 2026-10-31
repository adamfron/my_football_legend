import { z } from 'zod';
import { RandomGenerator } from '../random/RandomGenerator';
import { createKickFixture } from './physicalKickLaboratory';
import { integrateBallFlight } from './ballPhysics';
import { executePhysicalKick } from './kickExecution';
import { prepareTemporalStrike, ZERO_TEMPORAL_ERROR } from './temporalFootStrike';
import { kickPerturbationSchema } from './kickExecutionState';

export const temporalStrikeLabConfigSchema = z.object({
  seed: z.string(),
  speed: z.number().min(0).max(8).default(0),
  direction: z.enum(['approaching', 'departing', 'crossing']).default('crossing'),
  primary: z.number().min(1).max(100).default(70),
  technique: z.number().min(1).max(100).default(70),
  mirror: z.boolean().default(false),
  preparationSeconds: z.number().min(0).max(0.24).default(0.24),
  pressure: z.enum(['open', 'moderate', 'immediate']).default('open'),
});
/** Constructed engineering geometry. Its planned meeting point is a privileged nominal
 * intervention, not a claim that an actor foresaw exact future movement or a bounce. */
export const createTemporalStrikeFixture = (
  input: z.input<typeof temporalStrikeLabConfigSchema>,
) => {
  const config = temporalStrikeLabConfigSchema.parse(input);
  const f = createKickFixture({
    seed: config.seed,
    primary: config.primary,
    technique: config.technique,
    context: config.pressure,
  });
  const sign = config.mirror ? -1 : 1;
  f.actor.position.y = 34 + sign * 0.17;
  f.actor.profile.dominantFoot = config.mirror ? 'left' : 'right';
  f.state.ballEnvironment = { rollingResistanceMultiplier: 1, groundContact: 'event-v1' };
  f.state.ball.velocity = {
    x:
      config.direction === 'departing'
        ? config.speed
        : config.direction === 'approaching'
          ? -config.speed
          : 0,
    y: config.direction === 'crossing' ? sign * config.speed : 0,
    z: 0,
  };
  const initial = {
    position: { x: f.state.ball.x, y: f.state.ball.y, z: 0.11 },
    velocity: { ...f.state.ball.velocity, z: 0 },
    spin: { x: 0, y: 0, z: 0 },
    airborne: false,
    bounceCount: 0,
  };
  const request = {
    family: 'pass' as const,
    surface: 'inside' as const,
    foot: f.actor.profile.dominantFoot,
    nominalVelocity: { x: 12, y: 0, z: 0 as const },
    target: { x: 50, y: 34 },
    preparationSeconds: config.preparationSeconds,
    plannedBallPoint: integrateBallFlight(initial, 0.075, f.state.ballEnvironment).position,
  };
  return { ...f, config, initial, request, plan: prepareTemporalStrike(f.state, f.actor, request) };
};
const gaussian = (rng: RandomGenerator) =>
  Math.sqrt(-2 * Math.log(Math.max(1e-12, rng.float()))) * Math.cos(2 * Math.PI * rng.float());
export const temporalStrikeErrorReceiptSchema = z.object({
  episode: z.string(),
  latent: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  patchSigma: z.number().positive(),
  timingSigma: z.number().positive(),
  timingClipped: z.boolean(),
  error: kickPerturbationSchema,
});
/** Exploratory PR207-scale latents. Timing has ONE path: onset. It is not added again
 * to patch or effort. The finite validated ±20ms domain is disclosed as truncation. */
export const sampleTemporalStrikeLabError = (f: ReturnType<typeof createTemporalStrikeFixture>) => {
  const a = f.actor.profile.attributes;
  const nominal = executePhysicalKick(f.state, f.actor, f.request, ZERO_TEMPORAL_ERROR);
  const c = nominal.context;
  const ready = Math.min(1, c.preparationSeconds / (0.12 + (1 - a.agility / 100) * 0.1));
  const demand = 1 + (1 - ready) * 1.5 + (1 - c.balance) + c.weakFootDeficit * 0.5;
  const patchSigma = (0.0007 + (1 - c.skill) ** 2 * 0.006) * demand;
  const timingSigma =
    (0.001 + (1 - a.technique / 100) * 0.005) * (1 + c.pressure * (1 - a.composure / 100)) * demand;
  const episode = `${f.state.seed}:temporal-contact-dev-v1:${f.state.decisionIndex}:${f.actor.id}`;
  const rng = RandomGenerator.fromSeed(episode);
  const latent = [gaussian(rng), gaussian(rng), gaussian(rng)] as const;
  const timing = latent[1] * timingSigma;
  return temporalStrikeErrorReceiptSchema.parse({
    episode,
    latent,
    patchSigma,
    timingSigma,
    timingClipped: Math.abs(timing) > 0.02,
    error: {
      lateralPatchMetres: latent[0] * patchSigma,
      verticalPatchMetres: 0,
      timingSeconds: Math.max(-0.02, Math.min(0.02, timing)),
      effortError: latent[2] * (0.012 + (1 - c.skill) ** 2 * 0.14),
    },
  });
};
