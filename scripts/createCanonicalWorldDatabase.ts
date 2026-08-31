import { populateFootballerWorld } from '../src/core/footballerWorld';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import {
  WORLD_DATABASE_SEED,
  WORLD_DATABASE_VERSION,
  worldDatabaseSchema,
} from '../src/core/worldDatabase';
import type { WorldDatabase } from '../src/types/domain';
import { populatePolishU17World } from '../src/core/youthWorld';

export const createCanonicalWorldDatabase = (): WorldDatabase => {
  const generated = populateFootballerWorld(
    generateProfessionalClubPool(WORLD_DATABASE_SEED),
    WORLD_DATABASE_SEED,
  );
  const youth = populatePolishU17World(generated.clubs, WORLD_DATABASE_SEED);
  return worldDatabaseSchema.parse({
    version: WORLD_DATABASE_VERSION,
    startingSeason: 2026,
    seed: WORLD_DATABASE_SEED,
    clubs: generated.clubs,
    footballers: { ...generated.footballerWorld, ...youth.footballers },
    youthCohorts: youth.youthCohorts,
  }) as WorldDatabase;
};
