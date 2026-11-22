import { z } from 'zod';

const scalar = z.number().finite();
const horizontal = z.object({ x: scalar, y: scalar });
const point = horizontal.extend({ z: scalar });
const foot = z.enum(['left', 'right']);

export const dynamicBalanceEditionSchema = z.literal('dynamic-balance-dev-v1');
export const dynamicBalanceSchema = z.object({
  version: dynamicBalanceEditionSchema,
  centre: point,
  velocity: point,
  // World X/Y axes, in radians, radians/s, kg m² and kg m²/s respectively.
  tilt: horizontal,
  angularVelocity: horizontal,
  inertia: z.object({ x: scalar.positive(), y: scalar.positive() }),
  angularMomentum: horizontal,
  support: z
    .object({
      foot,
      point,
      normalForce: scalar.nonnegative(),
      tangentImpulse: horizontal,
      slip: horizontal.optional(),
    })
    .optional(),
  recovery: z.object({ foot, target: point }).optional(),
  phase: z.enum(['upright', 'perturbed', 'stepping', 'lost']),
  lastLoad: z
    .object({
      source: z.enum(['ball', 'opponent']),
      at: scalar.nonnegative(),
      point,
      impulse: point,
    })
    .optional(),
});

export type DynamicBalance = z.infer<typeof dynamicBalanceSchema>;
