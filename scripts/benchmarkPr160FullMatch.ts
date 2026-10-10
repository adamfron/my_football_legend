import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { assertMatchStatisticsInvariants } from '../src/core/matchSimulation/playerMatchStats';
import { clockPeriodThreshold } from '../src/core/matchSimulation/matchTimekeeping';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';

/** One representative, uninjected observer sanity run; deliberately not a calibration campaign. */
const world = createCanonicalWorldDatabase();
const seed = 'pr160-full-match-sanity';
let state = createTacticalMatch(
  createSingleMatchSession(world, {
    homeClubId: world.clubs[0]!.id,
    awayClubId: world.clubs[1]!.id,
    seed,
    control: { mode: 'spectator' },
  }),
);
const fixture = {
  seed,
  homeClubId: state.teams.home.clubId,
  awayClubId: state.teams.away.clubId,
  fixedDt: FIXED_MATCH_DT,
  playerAgencyEnabled: false,
  initialPlayers: state.players.map((player) => ({
    id: player.id,
    team: player.team,
    condition: player.fitness!.longTermCapacity,
  })),
  namedBench: {
    home: state.bench!.home.map((player) => player.id),
    away: state.bench!.away.map((player) => player.id),
  },
};
state.playerAgencyEnabled = false;
const periods: unknown[] = [],
  trace: unknown[] = [];
let ticks = 0,
  lastProgressAt = 0,
  progressKey = '',
  blockingKey = '',
  blockingSince = 0;
let maximumNoProgressSeconds = 0,
  maximumUnchangedBlockerSeconds = 0;
const started = performance.now();
const periodSummary = (snapshot: TacticalMatchState) => ({
  status: snapshot.status,
  actualEndedAt: snapshot.time,
  nominalEndAt: snapshot.timekeeping?.nominalEndAt,
  requiredEndAt: clockPeriodThreshold(snapshot),
  timekeeping: snapshot.timekeeping,
  score: snapshot.score,
  qualifyingLostSeconds: snapshot.stoppageLedger?.qualifyingCompletedSeconds,
  completedStoppages: snapshot.stoppageLedger?.completedCount,
});
for (; ticks < 280_000 && state.status !== 'full_time'; ticks++) {
  if (state.status === 'abandoned')
    throw new Error(`Unexpected abandonment: ${JSON.stringify(state.termination)}`);
  if (state.status === 'half_time') {
    periods.push(periodSummary(state));
    state = startSecondHalf(state);
    if (state.status !== 'second_half') throw new Error('Second half did not start legally.');
  }
  const previous = state;
  state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  const events = state.statistics!.players.reduce(
    (sum, player) => sum + player.touches + player.passesAttempted + player.shots,
    0,
  );
  const key = `${events}:${state.substitutionState!.completed.length}:${state.restart?.phase}:${state.restart?.awardId}:${state.score.home}:${state.score.away}`;
  if (key !== progressKey) {
    progressKey = key;
    lastProgressAt = state.time;
  }
  maximumNoProgressSeconds = Math.max(maximumNoProgressSeconds, state.time - lastProgressAt);
  if (state.time - lastProgressAt > 180)
    throw new Error(`No meaningful football/restart progress for 180s at ${state.time}.`);
  const blockers =
    state.restart?.phase !== 'release' && state.restart?.readiness?.blockers.length
      ? `${state.restart.awardId}:${state.restart.readiness.blockers.join('|')}`
      : '';
  if (blockers !== blockingKey) {
    blockingKey = blockers;
    blockingSince = state.time;
  }
  if (blockers)
    maximumUnchangedBlockerSeconds = Math.max(
      maximumUnchangedBlockerSeconds,
      state.time - blockingSince,
    );
  if (blockers && state.time - blockingSince > 120)
    throw new Error(`Unchanged restart blocker for 120s at ${state.time}: ${blockers}`);
  if (state.substitutionState!.completed.length > previous.substitutionState!.completed.length)
    trace.push(
      ...state.substitutionState!.completed.slice(previous.substitutionState!.completed.length),
    );
  if (state.injuries !== previous.injuries)
    trace.push(
      ...(state.injuries ?? []).filter(
        (injury) => !previous.injuries?.some((old) => old.id === injury.id),
      ),
    );
}
if (state.status !== 'full_time')
  throw new Error(`Tick bound reached with ${state.status} at ${state.time}.`);
periods.push(periodSummary(state));
assertMatchStatisticsInvariants(state.statistics!, state);
const passes = state.statistics!.players.reduce((sum, player) => sum + player.passesAttempted, 0);
if (passes < 10) throw new Error(`Full match produced only ${passes} pass attempts.`);
if (state.time < clockPeriodThreshold(state))
  throw new Error('Final whistle preceded the required period deadline.');
const bodies = [...(state.departedPlayers ?? []), ...state.players];
const evidence = {
  fixture,
  periods,
  ticks,
  wallMillisecondsIncludingObserver: Math.round(performance.now() - started),
  finalStatus: state.status,
  finalTime: state.time,
  score: state.score,
  football: {
    passes,
    shots: state.statistics!.players.reduce((sum, player) => sum + player.shots, 0),
    touches: state.statistics!.players.reduce((sum, player) => sum + player.touches, 0),
  },
  liveness: {
    maximumNoProgressSeconds,
    maximumUnchangedBlockerSeconds,
    diagnostics: state.restartLivenessDiagnostics ?? [],
  },
  substitutions: state.substitutionState,
  injuries: state.injuries ?? [],
  trace,
  players: state.statistics!.players.map((statistics) => {
    const body = bodies.find((player) => player.id === statistics.playerId);
    return {
      id: statistics.playerId,
      team: state.statistics!.playerTeams?.[statistics.playerId],
      minutes: statistics.minutesPlayed,
      distanceMetres: statistics.distanceCovered,
      sprintDistanceMetres: statistics.sprintDistance,
      longTermCapacity: body?.fitness?.longTermCapacity,
      burstReadiness: body?.fitness?.burstReadiness,
      workload: body?.fitness?.workload,
      injury: body?.injury,
    };
  }),
};
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  'docs/performance/PR160-full-match-sanity.json',
  JSON.stringify(evidence, null, 2) + '\n',
);
console.info(
  JSON.stringify({
    finalStatus: evidence.finalStatus,
    finalTime: evidence.finalTime,
    ticks,
    wallMilliseconds: evidence.wallMillisecondsIncludingObserver,
    football: evidence.football,
    substitutions: state.substitutionState!.completed.length,
    injuries: state.injuries?.length ?? 0,
    maximumNoProgressSeconds,
    maximumUnchangedBlockerSeconds,
  }),
);
