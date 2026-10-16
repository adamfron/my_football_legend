import { writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { advanceCareerFlow } from '../src/core/careerFlow';
import {
  acceptProfessionalOffer,
  retireCareer,
  continueOnExistingContract,
} from '../src/core/careerSeasons';
import { getCurrentFixture, advanceCareerWeek } from '../src/core/careerWeeks';
import { simulateRoutinePlayerMatch } from '../src/core/careerSimulation';
import { settleLeagueRound } from '../src/core/leagueSeason';
import { serializeCurrentCareerSave } from '../src/core/persistence';
import { getPlayerOverall } from '../src/core/playerOverall';

export const measure = async (label: string) => {
  let career = advanceCareerFlow(
    createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Kronika',
          nationality: 'PL',
          age: 16,
          dominantFoot: 'right',
          position: 'right_winger',
          heightCm: 178,
          weightKg: 70,
          seed: 'pr169-long-career',
        },
        'pr169-long-career',
        0,
      ),
      'pr169-long-career',
      createCanonicalWorldDatabase(),
    ),
  );
  const report: Record<string, unknown> = {
    label,
    method:
      'Real routine fixtures, annual world rollover and actual transfer offers; no forced trophies, growth or statistics. Same seed on PR168 and PR169.',
    rows: [],
  };
  const rows = report.rows as unknown[];
  const start = performance.now();
  mkdirSync('docs/performance', { recursive: true });
  let shortSave = '';
  for (let i = 0; i < 25 && career.careerStatus !== 'retired'; i++) {
    const rounds = new Map(
      career.leagueSeason!.rounds.flatMap((r) => r.fixtures.map((f) => [f.id, r.index])),
    );
    for (let step = 0; step < 65 && !career.seasonOutcome; step++) {
      const fixture = getCurrentFixture(career);
      if (fixture)
        career = settleLeagueRound(
          simulateRoutinePlayerMatch(career, fixture),
          rounds.get(fixture.id)!,
        );
      career = advanceCareerWeek(career);
    }
    if (!career.seasonOutcome) throw Error('Season did not complete');
    career = advanceCareerFlow(career);
    const save = serializeCurrentCareerSave(career);
    if (i === 1) shortSave = save;
    rows.push({
      season: career.careerSeasonNumber,
      age: career.player.age,
      clubId: career.currentClub.id,
      overall: getPlayerOverall(career.player, career.player.primaryPosition),
      outcome: career.seasonOutcome,
      saveBytes: Buffer.byteLength(save),
      appearances: career.seasonParticipation!.filter((r) => r.minutes > 0).length,
    });
    if (i === 24) break;
    const offer =
      career.professionalOffers?.find((o) => o.offerType !== 'renewal') ??
      career.professionalOffers?.[0];
    career = offer ? acceptProfessionalOffer(career, offer.id) : continueOnExistingContract(career);
  }
  report.elapsedMs = performance.now() - start;
  const save = serializeCurrentCareerSave(career);
  report.shortBytes = Buffer.byteLength(shortSave);
  report.longBytes = Buffer.byteLength(save);
  report.facts = career.historyFacts.length;
  report.completedSeasons = career.completedSeasons?.length;
  writeFileSync(`../pr169-${label}-long.json`, save);
  writeFileSync(`../pr169-${label}-short.json`, shortSave);
  writeFileSync(`../pr169-${label}-retired.json`, serializeCurrentCareerSave(retireCareer(career)));
  writeFileSync(`docs/performance/PR169-${label}.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      label,
      seasons: rows.length,
      longBytes: report.longBytes,
      shortBytes: report.shortBytes,
      elapsedMs: report.elapsedMs,
    }),
  );
};
