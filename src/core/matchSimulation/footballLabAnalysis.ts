import { z } from 'zod';

export const labDistributionSchema = z.object({
  samples: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  mean: z.number().nullable(),
  median: z.number().nullable(),
  p05: z.number().nullable(),
  p95: z.number().nullable(),
  minimum: z.number().nullable(),
  maximum: z.number().nullable(),
});
export const summariseLabMeasurements = (
  values: (number | null)[],
): z.infer<typeof labDistributionSchema> => {
  const sorted = values
    .filter((v): v is number => v !== null && Number.isFinite(v))
    .sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.floor((sorted.length - 1) * p)] ?? null;
  return labDistributionSchema.parse({
    samples: sorted.length,
    missing: values.length - sorted.length,
    mean: sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : null,
    median: at(0.5),
    p05: at(0.05),
    p95: at(0.95),
    minimum: at(0),
    maximum: at(1),
  });
};
export const attributeCoverageRowSchema = z.object({
  attribute: z.string(),
  productionReads: z.array(
    z.object({ path: z.string(), line: z.number().int().positive(), expression: z.string() }),
  ),
  wholeVectorConsumers: z.array(z.string()),
  dynamicReads: z.array(
    z.object({ path: z.string(), line: z.number().int().positive(), expression: z.string() }),
  ),
  declarativeReferences: z.array(z.object({ path: z.string(), line: z.number().int().positive() })),
  existingTests: z.array(z.string()),
  roles: z.object({
    physical: z.boolean(),
    candidateGeneration: z.boolean(),
    decisions: z.boolean(),
    fitnessRecovery: z.boolean(),
    goalkeeper: z.boolean(),
    career: z.boolean(),
  }),
  measuredDrills: z.array(z.string()),
  intendedContextExercised: z.boolean(),
  finding: z.enum([
    'measured_effect',
    'no_detectable_effect_in_sample',
    'not_exercised_in_intended_context',
    'no_static_reads_detected',
  ]),
});
export const attributeCoverageSchema = z.object({
  schema: z.literal('mfl-attribute-coverage-v1'),
  method: z.string(),
  attributes: z.array(attributeCoverageRowSchema).length(28),
});
export const labCompactTrialSchema = z.object({
  seed: z.string(),
  inputSha256: z.string(),
  resultSha256: z.string(),
  physicalSha256: z.string(),
  status: z.enum(['completed', 'failed', 'incomplete']),
  failure: z.string().nullable(),
  finishSeconds: z.number().nullable(),
  targetErrorMetres: z.number().nullable(),
  receptionQuality: z.number().nullable(),
  hits: z.number().int(),
  ticks: z.number().int().nonnegative(),
});
export const labSeriesSchema = z.object({
  id: z.string(),
  drill: z.string(),
  overrides: z.record(z.string(), z.number()),
  samples: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  incomplete: z.number().int(),
  metrics: z.record(z.string(), labDistributionSchema),
  trials: z.array(labCompactTrialSchema),
});
export const labSensitivitySchema = z.object({
  schema: z.literal('mfl-attribute-sensitivity-v1'),
  bands: z.array(z.number()),
  repetitions: z.number().int().positive(),
  pairedSeedPolicy: z.string(),
  rows: z.array(
    z.object({
      attribute: z.string(),
      context: z.string(),
      intendedContext: z.boolean(),
      metric: z.string(),
      effectRange: z.number().nullable(),
      pairedDelta: labDistributionSchema,
      bands: z.array(labSeriesSchema),
    }),
  ),
  interactions: z.array(
    z.object({
      name: z.string(),
      context: z.string(),
      metric: z.string(),
      differenceInDifferences: z.number().nullable(),
      cells: z.array(labSeriesSchema),
    }),
  ),
});
