import { z } from 'zod';

export const receptionPreparationEditionSchema = z.enum([
  'observed-reception-dev-v1',
  'adaptive-reception-dev-v1',
]);
