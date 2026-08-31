import { resolve } from 'node:path';
import { WORLD_DATABASE_VERSION } from '../src/core/worldDatabase';

export const GENERATED_PUBLIC_DIRECTORY = '.generated-public';
export const WORLD_DATABASE_ARTIFACT_PATH = resolve(
  GENERATED_PUBLIC_DIRECTORY,
  'data/world',
  `${WORLD_DATABASE_VERSION}.json`,
);
