import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, test } from 'vitest';
import { generateProfessionalClubPool } from '../src/core/professionalClubs';
import { populateFootballerWorld } from '../src/core/footballerWorld';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { careerStateSchema } from '../src/schemas/domainSchemas';
import { saveCareer } from '../src/core/persistence';
import { WORLD_DATABASE_SEED, worldDatabaseSchema } from '../src/core/worldDatabase';
import { WORLD_DATABASE_ARTIFACT_PATH } from './worldDatabaseArtifact';

const timed = <T>(work: () => T) => {
  const start = performance.now();
  const value = work();
  return [value, performance.now() - start] as const;
};
describe('local startup audit (informational, no timing assertions)', () => {
  test('prints generation and delta persistence costs', () => {
    const [clubs, clubMs] = timed(() => generateProfessionalClubPool(WORLD_DATABASE_SEED));
    const [generated, footballerMs] = timed(() =>
      populateFootballerWorld(clubs, WORLD_DATABASE_SEED),
    );
    const raw = readFileSync(WORLD_DATABASE_ARTIFACT_PATH, 'utf8');
    const database = worldDatabaseSchema.parse(JSON.parse(raw));
    const profile = generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Testowy',
        age: 15,
        nationality: 'PL',
        dominantFoot: 'right',
        difficulty: 'normal',
        position: 'striker',
        heightCm: 180,
        weightKg: 75,
        seed: 'audit',
      },
      'audit',
      0,
    );
    const [career, careerMs] = timed(() => createCareerState(profile, 'audit', database));
    const [, validationMs] = timed(() => careerStateSchema.parse(career));
    const [save, payloadMs] = timed(() => saveCareer(career));
    const [json, serializationMs] = timed(() => JSON.stringify(save));
    const hydratedBytes = JSON.stringify({
      clubs: generated.clubs,
      footballers: generated.footballerWorld,
    }).length;
    console.table({
      'club pool generation': `${clubMs.toFixed(1)} ms`,
      'footballer generation': `${footballerMs.toFixed(1)} ms`,
      'career construction': `${careerMs.toFixed(1)} ms`,
      'schema validation': `${validationMs.toFixed(1)} ms`,
      'save payload construction': `${payloadMs.toFixed(1)} ms`,
      serialization: `${serializationMs.toFixed(1)} ms`,
      'static database bytes': raw.length,
      'runtime hydrated bytes': hydratedBytes,
      'career save bytes': json.length,
      'footballer overrides': Object.keys(career.worldDelta?.footballerOverrides ?? {}).length,
      'squad overrides': Object.keys(career.worldDelta?.squadOverrides ?? {}).length,
      'new footballers': Object.keys(career.worldDelta?.newFootballers ?? {}).length,
      'storage write': 'not available in node audit',
    });
  });
});
