import { readFileSync, writeFileSync } from 'node:fs';
import {
  parseCareerSave,
  hydrateCareerWithWorld,
  serializeCurrentCareerSave,
} from '../src/core/persistence';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { generateSummerWindowOffers } from '../src/core/professionalClubs';
import {
  buildCareerNews,
  buildCareerStories,
  getCareerStatistics,
} from '../src/core/narrative/careerStories';
import { getDistinctCareerFacts } from '../src/core/narrative/careerEvidence';
import { getFactPresentation } from '../src/core/narrative/factPresentation';
import { performance } from 'node:perf_hooks';

export const prepare = () => {
  const world = createCanonicalWorldDatabase();
  const read = (file: string) => {
    const result = parseCareerSave(readFileSync(file, 'utf8'));
    if (!result.ok) throw Error(file);
    return hydrateCareerWithWorld(result.save.career, world);
  };
  const career = read('../pr169-after-short.json');
  const renewal = {
    ...career,
    player: { ...career.player, age: 36, dateOfBirth: `${career.currentSeason + 1 - 36}-01-01` },
    professionalOffers: undefined,
    renegotiation: undefined,
  };
  renewal.professionalOffers = generateSummerWindowOffers(renewal);
  if (!renewal.professionalOffers.some((o) => o.offerType === 'renewal'))
    throw Error('No credible renewal');
  writeFileSync('../pr169-renewal-age36.json', serializeCurrentCareerSave(renewal));
  const invalid = structuredClone(renewal);
  invalid.professionalOffers!.find((o) => o.offerType === 'renewal')!.contract.startDate =
    '2099-07-01';
  writeFileSync('../pr169-invalid-renewal.json', serializeCurrentCareerSave(invalid));
  const long = read('../pr169-after-long.json');
  const durations = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    buildCareerNews(long);
    buildCareerStories(long);
    getCareerStatistics(long);
    getDistinctCareerFacts(long.historyFacts).map((f) => getFactPresentation(long, f));
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  writeFileSync(
    'docs/performance/PR169-projections.json',
    JSON.stringify(
      {
        method:
          '100 pure projections over real 25-season career; news, stories, statistics, distinct facts and all fact presentations; excludes browser rendering.',
        facts: long.historyFacts.length,
        medianMs: durations[50],
        p95Ms: durations[95],
        maxMs: durations[99],
        statistics: getCareerStatistics(long),
      },
      null,
      2,
    ) + '\n',
  );
};
