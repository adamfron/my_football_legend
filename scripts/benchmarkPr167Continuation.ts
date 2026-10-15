import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { createPr167Career, pr167World as world } from './pr167Fixtures';
import {
  CareerMatchEvidence,
  createCareerMatchInput,
  startCareerMatch,
} from '../src/core/careerMatchContract';
import { continueCareerMatch } from '../src/core/careerMatchContinuation';
import { simulateSelectedCareerFixture } from '../src/core/careerSimulation';

const source = createPr167Career();
const input = createCareerMatchInput(source, world);
const initial = startCareerMatch(input);
const handoffs = [12, 45, 63, 89].map((minute) => {
  const state = structuredClone(initial);
  state.time = minute * 60;
  state.status = minute === 45 ? 'half_time' : minute > 45 ? 'second_half' : 'first_half';
  state.score =
    minute === 63
      ? { home: 2, away: 1 }
      : minute === 89
        ? { home: 3, away: 2 }
        : { home: 0, away: 0 };
  state.timekeeping = {
    period: minute > 45 ? 'second_half' : 'first_half',
    periodStartedAt: minute > 45 ? 2700 : 0,
    nominalEndAt: minute > 45 ? 5400 : 2700,
    qualifyingLostSeconds: 0,
    additionalLostAfterAnnouncement: 0,
    requiredEndAt: minute > 45 ? 5400 : 2700,
  };
  state.statistics!.observedThrough = state.time;
  const scorers = {
    home: state.players.find((p) => p.team === 'home' && p.slot.position === 'striker')!.id,
    away: state.players.find((p) => p.team === 'away' && p.slot.position === 'striker')!.id,
  };
  state.statistics!.players = state.statistics!.players.map((p) => ({
    ...p,
    minutesPlayed: minute,
    goals:
      p.playerId === scorers.home
        ? state.score.home
        : p.playerId === scorers.away
          ? state.score.away
          : 0,
    shots:
      p.playerId === scorers.home
        ? state.score.home
        : p.playerId === scorers.away
          ? state.score.away
          : 0,
    shotsOnTarget:
      p.playerId === scorers.home
        ? state.score.home
        : p.playerId === scorers.away
          ? state.score.away
          : 0,
  }));
  const heapBefore = process.memoryUsage().heapUsed,
    timings: number[] = [];
  let expected: string | undefined;
  for (let repeat = 0; repeat < 100; repeat++) {
    const start = performance.now(),
      result = continueCareerMatch(input, state, new CareerMatchEvidence());
    timings.push(performance.now() - start);
    const json = JSON.stringify(result);
    if (expected && json !== expected) throw new Error('Nondeterministic suffix');
    expected = json;
  }
  timings.sort((a, b) => a - b);
  return {
    minute,
    score: state.score,
    remainingSeconds: JSON.parse(expected!).continuation.remainingSeconds,
    medianMs: timings[50],
    p95Ms: timings[95],
    resultBytes: Buffer.byteLength(expected!),
    heapBefore,
    heapAfter: process.memoryUsage().heapUsed,
    identicalRepeats: 100,
    physicalTicksExecuted: 0,
  };
});
const fullSummary = Array.from({ length: 100 }, () => {
  const start = performance.now();
  simulateSelectedCareerFixture(source);
  return performance.now() - start;
}).sort((a, b) => a - b);
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  'docs/performance/PR167-continuation.json',
  JSON.stringify(
    {
      provenance:
        'Constructed consistent handoff fixtures; not physically observed 12/45/63/89-minute games. Timing includes contract validation, prefix copy, simulation and merge. Warm local Node CPU samples; not browser latency or peak memory.',
      handoffs,
      fullSummary: {
        medianMs: fullSummary[50],
        p95Ms: fullSummary[95],
        repeats: 100,
        physicalTicksExecuted: 0,
      },
    },
    null,
    2,
  ) + '\n',
);
