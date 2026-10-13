import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import {
  parseCareerSave,
  hydrateCareerWithWorld,
  serializeCurrentCareerSave,
} from '../src/core/persistence';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { simulateRoutinePlayerMatch } from '../src/core/careerSimulation';
import { settleLeagueRound } from '../src/core/leagueSeason';
import { advanceCareerFlow } from '../src/core/careerFlow';
import { acceptProfessionalOffer, stayAtCurrentClub } from '../src/core/careerSeasons';
import { retainCareerMatchResults } from '../src/core/careerMatchRetention';

// Begin with the actual IndexedDB save produced by the production-browser full match.
// Later fixtures use the existing routine summary path; capacity copies are labelled separately.
const world = createCanonicalWorldDatabase();
const loaded = parseCareerSave(
  readFileSync(process.argv[2] ?? '../pr166-browser-career-save.json', 'utf8'),
);
if (!loaded.ok) throw new Error('Expected the actual committed browser career save.');
let career = hydrateCareerWithWorld(loaded.save.career, world);
const source = career.historyFacts.find((fact) => fact.factType === 'canonical_match_result');
if (!source?.data.resultFingerprint) throw new Error('Browser save has no canonical receipt.');
const firstFixtureId = (source.data.summary as { fixture: { id: string } }).fixture.id;
const firstScore = (source.data.summary as { score: { home: number; away: number } }).score;
const records: unknown[] = [];
const capture = (completedSeasons: number) => {
  const serialized = serializeCurrentCareerSave(career);
  const parsed = parseCareerSave(serialized);
  if (!parsed.ok) throw new Error('Long career failed save validation.');
  const receipt = parsed.save.career.historyFacts.find((fact) => fact.id === source.id);
  if (receipt?.data.resultFingerprint !== source.data.resultFingerprint)
    throw new Error('Canonical fingerprint lost.');
  if (parsed.save.career.completedSeasons?.length) {
    const archived = parsed.save.career.completedSeasons
      .flatMap((season) => season.matches)
      .find((match) => match.matchId === firstFixtureId);
    if (!archived || JSON.stringify(archived.score) !== JSON.stringify(firstScore))
      throw new Error('Canonical score lost in the long-term archive.');
  }
  records.push({
    completedSeasons,
    age: career.player.age,
    actualCanonicalReceipts: career.historyFacts.filter(
      (fact) => fact.factType === 'canonical_match_result',
    ).length,
    archivedFixtures: career.completedSeasons?.flatMap((season) => season.matches).length ?? 0,
    saveBytes: Buffer.byteLength(serialized),
    richCanonicalResults: parsed.save.career.historyFacts.filter((fact) => fact.data.result).length,
  });
};
capture(0);
let completed = 0;
while (completed < 20 && career.careerStatus !== 'retired') {
  let guard = 0;
  while (!career.seasonOutcome && guard++ < 100) {
    const fixture = getCurrentFixture(career);
    if (fixture) {
      career = simulateRoutinePlayerMatch(career, fixture);
      career = settleLeagueRound(
        career,
        career.leagueSeason!.rounds.findIndex((round) =>
          round.fixtures.some((match) => match.id === fixture.id),
        ),
      );
    }
    career = advanceCareerWeek(career);
  }
  if (!career.seasonOutcome) throw new Error(`Season stalled: ${career.currentSeason}`);
  completed++;
  if ([1, 5, 10, 20].includes(completed)) capture(completed);
  career = advanceCareerFlow(career);
  const offer = career.professionalOffers?.[0];
  career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
  const reloaded = parseCareerSave(serializeCurrentCareerSave(career));
  if (!reloaded.ok) throw new Error('Season rollover failed save validation.');
  career = hydrateCareerWithWorld(reloaded.save.career, world);
}
if (completed !== 20) capture(completed);
const capacity = [120, 600].map((count) => {
  const historyFacts = [
    ...career.historyFacts,
    ...Array.from({ length: count - 1 }, (_, index) => ({
      ...source,
      id: `capacity-copy:${index}`,
      season: career.currentSeason - 1,
    })),
  ];
  const scaled = retainCareerMatchResults({ ...career, historyFacts });
  const serialized = serializeCurrentCareerSave(scaled);
  if (!parseCareerSave(serialized).ok) throw new Error('Capacity save failed validation.');
  return {
    canonicalReceipts: count,
    saveBytes: Buffer.byteLength(serialized),
    meaning:
      'Capacity simulation: clones of one actual production-browser canonical receipt added to the actual long career; no claim of independently played fixtures.',
  };
});
writeFileSync(
  'docs/performance/PR166-long-career-storage.json',
  JSON.stringify(
    {
      seed: career.seed,
      completedSeasons: completed,
      scenario:
        'Actual production U-17 canonical match, then existing routine fixtures with real career rollovers/save/hydration; retained canonical fingerprint checked at milestones.',
      baselineRoutineOnly20Seasons: {
        bytes: 1211563,
        source: 'docs/performance/PR164-storage-world.json',
        comparable: false,
        reason:
          'Different seed; routine-only historical reference, not a measured before/after canonical career.',
      },
      records,
      capacity,
    },
    null,
    2,
  ) + '\n',
);
process.stdout.write(JSON.stringify({ completed, records, capacity }) + '\n');
