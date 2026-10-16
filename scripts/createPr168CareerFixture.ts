import { writeFileSync } from 'node:fs';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { advanceCareerFlow } from '../src/core/careerFlow';
import {
  acceptProfessionalOffer,
  retireCareer,
  stayAtCurrentClub,
} from '../src/core/careerSeasons';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { simulateRoutinePlayerMatch } from '../src/core/careerSimulation';
import { settleLeagueRound } from '../src/core/leagueSeason';
import { getPlayerOverall } from '../src/core/playerOverall';
import { serializeCurrentCareerSave } from '../src/core/persistence';

let career = advanceCareerFlow(
  createCareerState(
    generateStartingPlayerProfile(
      {
        firstName: 'Jan',
        lastName: 'Historia',
        nationality: 'PL',
        age: 16,
        dominantFoot: 'right',
        position: 'right_winger',
        heightCm: 178,
        weightKg: 70,
        seed: 'pr168-history',
      },
      'pr168-history',
      0,
    ),
    'pr168-history',
    createCanonicalWorldDatabase(),
  ),
);
const rows = [];
for (let season = 0; season < 18 && career.careerStatus !== 'retired'; season++) {
  const rounds = new Map(
    career.leagueSeason!.rounds.flatMap((round) =>
      round.fixtures.map((fixture) => [fixture.id, round.index]),
    ),
  );
  for (let week = 0; week < 65 && !career.seasonOutcome; week++) {
    const fixture = getCurrentFixture(career);
    if (fixture)
      career = settleLeagueRound(
        simulateRoutinePlayerMatch(career, fixture),
        rounds.get(fixture.id) ?? -1,
      );
    career = advanceCareerWeek(career);
  }
  if (!career.seasonOutcome) throw new Error('Season did not finish');
  career = advanceCareerFlow(career);
  rows.push({
    season: career.careerSeasonNumber,
    age: career.player.age,
    overall: getPlayerOverall(career.player, career.player.primaryPosition),
    clubId: career.currentClub.id,
    offers:
      career.professionalOffers?.map((offer) => ({
        tier: offer.club.leagueTier,
        clubId: offer.club.id,
        role: offer.contract.squadRole,
        standing: offer.projectedStanding,
        position: offer.plannedPosition,
      })) ?? [],
  });
  const offer =
    career.professionalOffers?.find((offer) => offer.offerType !== 'renewal') ??
    career.professionalOffers?.[0];
  career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
}
career = retireCareer(career, 'decyzja zawodnika po osiemnastu sezonach');
writeFileSync('../pr168-retired-career.json', serializeCurrentCareerSave(career));
writeFileSync(
  'docs/performance/PR168-career-trajectory.json',
  JSON.stringify(
    {
      method:
        'Eighteen genuine routine career seasons with real world rollover, offers and transfer acceptance. Not a replay of the unavailable user save. No forced OVR growth or honours.',
      rows,
      retirement: {
        date: career.retirementDate,
        age: career.retirementAge,
        seasons: career.completedSeasons?.length,
        highestOVR: career.highestOVR,
      },
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    years: rows.length,
    retired: career.retirementDate,
    highestOVR: career.highestOVR,
  }),
);
