import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import { populateFootballerWorld } from '../src/core/footballerWorld';
import {
  WORLD_DATABASE_SEED,
  WORLD_DATABASE_VERSION,
  worldDatabaseSchema,
} from '../src/core/worldDatabase';
import { test } from 'vitest';

test('generates the canonical world database', () => {
  const generated = populateFootballerWorld(
    generateProfessionalClubPool(WORLD_DATABASE_SEED),
    WORLD_DATABASE_SEED,
  );
  const database = worldDatabaseSchema.parse({
    version: WORLD_DATABASE_VERSION,
    startingSeason: 2026,
    seed: WORLD_DATABASE_SEED,
    clubs: generated.clubs,
    footballers: generated.footballerWorld,
    youthCohorts: {},
  });
  if (database.clubs.length !== 64) throw new Error('World database must contain 64 clubs.');
  if (Object.keys(database.footballers).length !== 1536)
    throw new Error('World database must contain 1536 footballers.');
  for (const club of database.clubs)
    for (const id of club.squadPlayerIds ?? [])
      if (!database.footballers[id]) throw new Error(`Unresolved squad member: ${id}`);
  const output = resolve('public/data/world', `${WORLD_DATABASE_VERSION}.json`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(database)}\n`);
  console.log(
    `world database: ${database.clubs.length} clubs, ${Object.keys(database.footballers).length} footballers`,
  );
  console.log(`wrote ${output}`);
});
