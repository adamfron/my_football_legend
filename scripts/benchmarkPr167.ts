import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createCareerState, generateStartingPlayerProfile } from '../src/core/playerCreator';
import { pr167World as world } from './pr167Fixtures';
import { advanceCareerFlow } from '../src/core/careerFlow';
import { advanceCareerWeek, getCurrentFixture } from '../src/core/careerWeeks';
import { simulateRoutinePlayerMatch } from '../src/core/careerSimulation';
import { settleLeagueRound } from '../src/core/leagueSeason';
import { acceptProfessionalOffer, stayAtCurrentClub } from '../src/core/careerSeasons';
import {
  serializeCareerSave,
  parseCareerSave,
  hydrateCareerWithWorld,
} from '../src/core/persistence';
import {
  createCareerWorldFootballerResolver,
  resolveEffectiveSeniorSquad,
} from '../src/core/worldDatabase';
import { getPlayerOverall } from '../src/core/playerOverall';
import { getCareerClubStrength } from '../src/core/clubStrength';
import { getProfileAge } from '../src/core/age';
import { getCareerNpcPlayStyles } from '../src/core/npcCareerIdentity';
import { auditSeniorWorld } from '../src/core/worldIntegrity';
import { NPC_DEVELOPMENT_CURVES, projectNpcAttributesAtDate } from '../src/core/seasonDevelopment';
import type { CareerState, NpcDevelopmentCurveId } from '../src/types/domain';

const distribution = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0],
    p10: sorted[Math.floor(sorted.length * 0.1)],
    median: sorted[Math.floor(sorted.length * 0.5)],
    p90: sorted[Math.floor(sorted.length * 0.9)],
    max: sorted.at(-1),
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
};
const started = performance.now();
let career: CareerState;
if (process.argv[2]) {
  const loaded = parseCareerSave(readFileSync(process.argv[2], 'utf8'));
  if (!loaded.ok) throw new Error('Invalid actual browser save');
  career = hydrateCareerWithWorld(loaded.save.career, world);
} else {
  const seed = 'pr164-save';
  career = advanceCareerFlow(
    createCareerState(
      generateStartingPlayerProfile(
        {
          firstName: 'Jan',
          lastName: 'Pomiar',
          age: 16,
          nationality: 'PL',
          dominantFoot: 'right',
          position: 'central_midfielder',
          heightCm: 178,
          weightKg: 70,
          seed,
        },
        seed,
        0,
      ),
      seed,
      world,
    ),
  );
}
const firstReceipts = career.historyFacts
  .filter((f) => f.factType === 'canonical_match_result')
  .map((f) => ({ id: f.id, fingerprint: f.data.resultFingerprint }));
const milestones: unknown[] = [];
const seasons: unknown[] = [];
const capture = (completed: number) => {
  const begin = performance.now(),
    heapBefore = process.memoryUsage().heapUsed;
  const resolve = createCareerWorldFootballerResolver(career, { cache: true });
  const ids = [
    ...new Set(
      (career.clubWorld ?? []).flatMap((club) =>
        resolveEffectiveSeniorSquad(career, club.id, resolve),
      ),
    ),
  ].filter((id) => id !== career.player.id);
  const players = ids.map((id) => resolve(id)!).filter(Boolean);
  const rows = players.map((p) => ({
    id: p.profile.id,
    position: p.profile.primaryPosition,
    age: getProfileAge(p.profile, career.currentDate!),
    overall: getPlayerOverall(p.profile, p.profile.primaryPosition),
    pace: p.profile.attributes.pace,
    technique: p.profile.attributes.technique,
    gameReading: p.profile.attributes.gameReading,
    strength: p.profile.attributes.strength,
    styles: getCareerNpcPlayStyles(career, p.profile).length,
  }));
  const projectionMs = performance.now() - begin;
  const strengths = (career.clubWorld ?? []).map((club) => getCareerClubStrength(career, club));
  const text = serializeCareerSave(career),
    loaded = parseCareerSave(text);
  if (!loaded.ok) throw new Error('Milestone save invalid');
  const hydrated = hydrateCareerWithWorld(loaded.save.career, world);
  const check = createCareerWorldFootballerResolver(hydrated, { cache: true });
  if (
    players.some((p) => JSON.stringify(check(p.profile.id)?.profile) !== JSON.stringify(p.profile))
  )
    throw new Error('NPC projection changed after save/load');
  if (
    firstReceipts.some(
      (f) =>
        career.historyFacts.find((fact) => fact.id === f.id)?.data.resultFingerprint !==
        f.fingerprint,
    )
  )
    throw new Error('Original canonical receipt changed');
  const record = {
    completedSeasons: completed,
    date: career.currentDate,
    saveBytes: Buffer.byteLength(text),
    projectionMs,
    heapBefore,
    heapAfter: process.memoryUsage().heapUsed,
    population: auditSeniorWorld(career),
    ages: distribution(rows.map((r) => r.age)),
    overall: distribution(rows.map((r) => r.overall)),
    strength: distribution(strengths),
    styles: [0, 1, 2].map((count) => ({
      count,
      players: rows.filter((r) => r.styles === count).length,
    })),
    positions: [...new Set(rows.map((r) => r.position))].map((position) => ({
      position,
      overall: distribution(rows.filter((r) => r.position === position).map((r) => r.overall)),
      paceMinusTechnique: distribution(
        rows.filter((r) => r.position === position).map((r) => r.pace - r.technique),
      ),
    })),
    examples: rows.filter((r) => r.age <= 20 || r.age >= 33).slice(0, 12),
    attributeOverrides: Object.keys(career.worldDelta?.footballerAttributeOverrides ?? {}).length,
  };
  milestones.push(record);
  console.log(
    JSON.stringify({
      milestone: completed,
      saveBytes: record.saveBytes,
      meanOverall: record.overall.mean,
      projectionMs,
    }),
  );
};
capture(0);
for (let completed = 1; completed <= 20; completed++) {
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
  const health = auditSeniorWorld(career);
  if (
    health.clubsBelow11 ||
    health.clubsWithoutGoalkeeper ||
    health.clubsWithoutTenOutfield ||
    health.duplicateActiveSeniorMemberships
  )
    throw new Error('World squad health failed');
  seasons.push({ completed, date: career.currentDate, health });
  if ([1, 5, 10, 20].includes(completed)) capture(completed);
  if (completed === 20) break;
  career = advanceCareerFlow(career);
  const offer = career.professionalOffers?.[0];
  career = offer ? acceptProfessionalOffer(career, offer.id) : stayAtCurrentClub(career);
  const loaded = parseCareerSave(serializeCareerSave(career));
  if (!loaded.ok) throw new Error('Rollover save invalid');
  career = hydrateCareerWithWorld(loaded.save.career, world);
  if (career.careerStatus === 'retired') throw new Error('Retired before 20 seasons');
}
const cohort = Object.values(world.footballers).filter((p) => p.profile.age <= 20);
const curves = Object.keys(NPC_DEVELOPMENT_CURVES).map((curve) => ({
  curve,
  ages: [18, 23, 28, 33, 38].map((age) => {
    const players = cohort.map((base) => {
      const footballer = {
        ...base,
        profile: { ...base.profile, age: 18, dateOfBirth: '2008-01-01' },
        developmentCurveId: curve as NpcDevelopmentCurveId,
      };
      return {
        ...footballer.profile,
        attributes: projectNpcAttributesAtDate({ footballer, date: `${2008 + age}-07-01` }),
      };
    });
    return {
      age,
      overall: distribution(players.map((p) => getPlayerOverall(p, p.primaryPosition))),
      pace: distribution(players.map((p) => p.attributes.pace)),
      reading: distribution(players.map((p) => p.attributes.gameReading)),
    };
  }),
}));
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  process.argv[2]
    ? 'docs/performance/PR167-world-browser.json'
    : 'docs/performance/PR167-world.json',
  JSON.stringify(
    {
      seed: career.seed,
      source: process.argv[2]
        ? 'actual browser career continued through 20 seasons'
        : 'fresh routine-summary career',
      timing:
        'single local Node CPU run; heap samples include generation, audit and serialization; not browser FPS or peak RSS',
      elapsedMs: performance.now() - started,
      firstReceipts,
      milestones,
      seasons,
      curves,
    },
    null,
    2,
  ) + '\n',
);
