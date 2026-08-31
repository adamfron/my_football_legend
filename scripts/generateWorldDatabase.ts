import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { worldDatabaseSchema } from '../src/core/worldDatabase';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { WORLD_DATABASE_ARTIFACT_PATH } from './worldDatabaseArtifact';

const database = worldDatabaseSchema.parse(createCanonicalWorldDatabase());
mkdirSync(dirname(WORLD_DATABASE_ARTIFACT_PATH), { recursive: true });
writeFileSync(WORLD_DATABASE_ARTIFACT_PATH, `${JSON.stringify(database)}\n`);
console.log(
  `world database: ${database.clubs.length} clubs, ${Object.keys(database.footballers).length} footballers`,
);
console.log(`wrote ${WORLD_DATABASE_ARTIFACT_PATH}`);
