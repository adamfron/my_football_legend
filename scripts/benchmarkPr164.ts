import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { worldDatabaseSchema } from '../src/core/worldDatabase';
import { WORLD_DATABASE_ARTIFACT_PATH } from './worldDatabaseArtifact';
import {
  serializeCareerSave,
  parseCareerSave,
  hydrateCareerWithWorld,
  measureCareerSaveSections,
} from '../src/core/persistence';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { simulateRoutinePlayerMatch } from '../src/core/careerSimulation';
import { settleLeagueRound } from '../src/core/leagueSeason';
import { advanceCareerFlow } from '../src/core/careerFlow';
import { acceptProfessionalOffer, stayAtCurrentClub } from '../src/core/careerSeasons';
import type { CareerState } from '../src/types/domain';

const timed = <T>(operation: () => T) => {
  const start = performance.now();
  const value = operation();
  return { value, ms: performance.now() - start };
};
const sizes = (raw: string) => ({
  utf8: Buffer.byteLength(raw),
  gzip: gzipSync(raw, { level: 9 }).byteLength,
  brotli: brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).byteLength,
});
const raw = readFileSync(WORLD_DATABASE_ARTIFACT_PATH, 'utf8');
const parsed = timed(() => JSON.parse(raw)),
  validated = timed(() => worldDatabaseSchema.parse(parsed.value));
const world = validated.value;
const profile = generateStartingPlayerProfile(
  {
    firstName: 'Jan',
    lastName: 'Pomiar',
    age: 16,
    nationality: 'PL',
    dominantFoot: 'right',
    position: 'central_midfielder',
    heightCm: 178,
    weightKg: 70,
    seed: 'pr164-save',
  },
  'pr164-save',
  0,
);
const created = timed(() => createCareerState(profile, 'pr164-save', world));
let career = created.value;
const records: unknown[] = [];
const capture = (completedSeasons: number) => {
  const serialization = timed(() => serializeCareerSave(career));
  const parse = timed(() => JSON.parse(serialization.value));
  const load = timed(() => parseCareerSave(serialization.value));
  if (!load.value.ok) throw new Error('Invalid benchmark save');
  const hydration = timed(() =>
    hydrateCareerWithWorld(load.value.ok ? load.value.save.career : career, world),
  );
  const dto = parse.value.career;
  records.push({
    completedSeasons,
    careerSeason: career.careerSeasonNumber,
    age: career.player.age,
    date: career.currentDate ?? '2026-07-01',
    bytes: sizes(serialization.value),
    serializationMs: serialization.ms,
    jsonParseMs: parse.ms,
    parseAndValidationMs: load.ms,
    hydrationMs: hydration.ms,
    sections: measureCareerSaveSections(career),
    worldDeltaKeys: Object.keys(dto.worldDelta ?? {}),
    newFootballers: Object.keys(dto.worldDelta?.newFootballers ?? {}).length,
    npcStateOverrides: Object.keys(dto.worldDelta?.footballerStateOverrides ?? {}).length,
    historyFacts: dto.historyFacts.length,
    archivedMatches: (dto.completedSeasons ?? []).flatMap((s: { matches: unknown[] }) => s.matches)
      .length,
  });
  mkdirSync('docs/performance', { recursive: true });
  writeFileSync(
    'docs/performance/PR164-storage-world.json',
    JSON.stringify(
      {
        seed: 'pr164-save',
        timing: 'single-run local CPU; informational, not browser timings',
        world: {
          ...sizes(raw),
          clubs: world.clubs.length,
          footballers: Object.keys(world.footballers).length,
          youthCohorts: Object.keys(world.youthCohorts).length,
          jsonParseMs: parsed.ms,
          validationMs: validated.ms,
          careerConstructionMs: created.ms,
        },
        careers: records,
      },
      null,
      2,
    ) + '\n',
  );
  if (completedSeasons === 1) writeFileSync('../pr164-browser-save.json', serialization.value);
  console.log('save milestone', completedSeasons, Buffer.byteLength(serialization.value));
};
capture(0);
career = advanceCareerFlow(career);
let completed = 0;
while (completed < 20 && career.careerStatus !== 'retired') {
  let guard = 0;
  while (!career.seasonOutcome && guard++ < 100) {
    const fixture = getCurrentFixture(career);
    if (fixture) {
      career = simulateRoutinePlayerMatch(career, fixture);
      const round = career.leagueSeason!.rounds.findIndex((r) =>
        r.fixtures.some((f) => f.id === fixture.id),
      );
      career = settleLeagueRound(career, round);
    }
    career = advanceCareerWeek(career);
  }
  if (!career.seasonOutcome) throw new Error(`Season stalled: ${career.currentSeason}`);
  completed++;
  if ([1, 5, 10, 20].includes(completed)) capture(completed);
  career = advanceCareerFlow(career);
  const offer = career.professionalOffers?.[0];
  career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
  // Use the production persistence/hydration boundary at every rollover.
  const loaded = parseCareerSave(serializeCareerSave(career));
  if (!loaded.ok) throw new Error('Rollover save invalid');
  career = hydrateCareerWithWorld(loaded.save.career, world) as CareerState;
}
if (completed < 20) throw new Error('Seed retired before required twenty-season milestone');
// Scale only schema-shaped records; no synthetic IDs enter production or the career.
const scaling = [
  1000,
  Object.keys(world.footballers).length,
  Object.keys(world.footballers).length * 2,
].map((count) => {
  const entries = Object.entries(world.footballers),
    footballers = Object.fromEntries(
      Array.from({ length: count }, (_, i) => [
        i < entries.length ? entries[i]![0] : `scale-only-${i}`,
        entries[i % entries.length]![1],
      ]),
    );
  const text = JSON.stringify({ ...world, footballers }),
    parse = timed(() => JSON.parse(text)),
    validate = timed(() => worldDatabaseSchema.parse(parse.value));
  return {
    records: count,
    ...sizes(text),
    jsonParseMs: parse.ms,
    validationMs: validate.ms,
    synthetic: count !== entries.length,
  };
});
const receipt = JSON.parse(readFileSync('docs/performance/PR164-storage-world.json', 'utf8'));
receipt.world.scaling = scaling;
writeFileSync('docs/performance/PR164-storage-world.json', JSON.stringify(receipt, null, 2) + '\n');
