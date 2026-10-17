import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createPr167Career, pr167World } from './pr167Fixtures';
import {
  hydrateCareerWithWorld,
  parseCareerSave,
  serializeCurrentCareerSave,
} from '../src/core/persistence';
import { generateSummerWindowOffers } from '../src/core/professionalClubs';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation';
import { PresentationFrameProjector } from '../src/app/match/tacticalRenderer/frameProjection';
import { deriveStadiumConfiguration } from '../src/app/match/tacticalRenderer/stadium';
import { projectMatchKits } from '../src/app/match/tacticalRenderer/kits';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
import { createLeagueSeason } from '../src/core/leagueSeason';
import { leagueSeasonSchema } from '../src/schemas/domainSchemas';

export const prepare = (full = false) => {
  const sourceText = gunzipSync(
    readFileSync('docs/performance/fixtures/PR170-source-career.json.gz'),
  ).toString('utf8');
  writeFileSync('../pr170-before-offers.json', sourceText);
  writeFileSync(
    '../pr170-hybrid.json',
    gunzipSync(readFileSync('docs/performance/fixtures/PR170-hybrid-career.json.gz')),
  );
  const source = parseCareerSave(sourceText);
  if (!source.ok) throw Error('Source career');
  const career = hydrateCareerWithWorld(source.save.career, pr167World);
  career.professionalOffers = generateSummerWindowOffers(career);
  writeFileSync('../pr170-after-offers.json', serializeCurrentCareerSave(career));
  const youth = createPr167Career(false, 'pr170-browser');
  youth.activeMatch = undefined;
  youth.decisionPoint = undefined;
  writeFileSync('../pr170-dashboard.json', serializeCurrentCareerSave(youth));
  for (const count of [12, 16, 20, 24]) {
    const clubs = [
      youth.leagueSeason!.clubs.find((club) => club.clubId === youth.currentClub.id)!,
      ...pr167World.clubs
        .filter((club) => club.id !== youth.currentClub.id)
        .slice(0, count - 1)
        .map((club) => ({
          clubId: club.id,
          name: club.name,
          strength: 50,
          attackStrength: 50,
          defenseStrength: 50,
          form: 0,
        })),
    ];
    const season = createLeagueSeason('pr170-layout', {
      controlledClubId: youth.currentClub.id,
      leagueClubs: clubs,
    });
    // Presentation capacity fixture only: generate valid dates for this larger circle schedule.
    season.rounds.forEach((round, index) => {
      const date = new Date('2026-08-01T12:00:00Z');
      date.setUTCDate(date.getUTCDate() + index * 5);
      round.date = date.toISOString().slice(0, 10);
      round.fixtures.forEach((fixture) => {
        fixture.date = round.date;
      });
    });
    season.startDate = season.rounds[0]!.date;
    leagueSeasonSchema.parse(season);
    writeFileSync(
      `../pr170-table-${count}.json`,
      serializeCurrentCareerSave({ ...youth, leagueSeason: season }),
    );
  }
  const session = createSingleMatchSession(pr167World, {
    homeClubId: pr167World.clubs[0]!.id,
    awayClubId: pr167World.clubs[1]!.id,
    seed: 'pr161-full-match-sanity',
    control: { mode: 'spectator' },
  });
  const projector = new PresentationFrameProjector(session.presentation);
  let state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  const kits = projectMatchKits(session.home.club, session.away.club);
  const clubs = Object.fromEntries(
    ['community', 'compact', 'bowl'].map((archetype) => [
      archetype,
      pr167World.clubs.find(
        (club) => deriveStadiumConfiguration(club.id, kits.home).archetype === archetype,
      )!.id,
    ]),
  );
  const snapshots: Record<string, TacticalMatchState> = { kickoff: structuredClone(state) };
  const frames = { kickoff: projector.frame(state) } as Record<
    string,
    ReturnType<typeof projector.frame>
  >;
  const start = performance.now();
  for (let ticks = 0; ticks < (full ? 280000 : 800); ticks++) {
    if (state.status === 'full_time' || state.status === 'abandoned') break;
    if (state.status === 'half_time') {
      snapshots.half_time = structuredClone(state);
      frames.half_time = projector.frame(state);
      state = startSecondHalf(state);
    }
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    if (!snapshots.gameplay && state.time >= 15) {
      snapshots.gameplay = structuredClone(state);
      frames.gameplay = projector.frame(state);
    }
    if (
      !snapshots.goal &&
      state.postGoal &&
      state.matchEvents?.some((event) => event.kind === 'goal')
    ) {
      snapshots.goal = structuredClone(state);
      frames.goal = projector.frame(state);
    }
  }
  if (full) {
    if (state.status !== 'full_time') throw Error(`No full time: ${state.status}:${state.time}`);
    snapshots.full_time = structuredClone(state);
    frames.full_time = projector.frame(state);
  }
  const data = {
    session,
    kits,
    clubs,
    snapshots,
    frames,
    canonicalHash: createHash('sha256').update(JSON.stringify(state)).digest('hex'),
    elapsedMs: performance.now() - start,
    endedAt: state.time,
    score: state.score,
  };
  writeFileSync('../pr170-render-fixture.json', JSON.stringify(data));
  return {
    endedAt: data.endedAt,
    score: state.score,
    elapsedMs: data.elapsedMs,
    canonicalHash: data.canonicalHash,
    moments: Object.keys(snapshots),
  };
};
