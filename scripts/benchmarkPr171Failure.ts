import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPr171Fixture } from './pr171Fixtures';
import {
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { AttackingFunnelTracker } from '../src/core/matchSimulation/attackingFunnel';
import { projectMatchCentreStatistics } from '../src/core/matchSimulation/matchCentreStatistics';
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rows: unknown[] = [];
for (const reversed of [false, true]) {
  const fixture = createPr171Fixture('strong_weak', reversed);
  let state = fixture.state;
  const tracker = new AttackingFunnelTracker(undefined, true, true);
  const start = performance.now();
  let error: string | null = null,
    replayError: string | null = null;
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    const previous = state;
    try {
      state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    } catch (cause) {
      error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
      writeFileSync(`../pr171-failure-${reversed}.json`, JSON.stringify(state));
      try {
        stepTacticalMatchAfterDecisionProbe(structuredClone(state), FIXED_MATCH_DT);
      } catch (replayed) {
        replayError = replayed instanceof Error ? replayed.message : String(replayed);
      }
      break;
    }
    tracker.observe(previous, state);
    if (Math.round(state.time * 40) % 24000 === 0)
      console.log(`strong_weak ${reversed} ${state.time.toFixed(1)}`);
  }
  rows.push({
    family: 'strong_weak',
    seed: fixture.seed,
    reversed,
    fixtureHash: hash(fixture.session),
    finalStateHash: hash(state),
    status: error ? 'engine_error' : state.status,
    at: state.time,
    error,
    replayError,
    wallMs: performance.now() - start,
    officialPrefixOnly: projectMatchCentreStatistics(state),
    funnelPrefixOnly: tracker.snapshot(state.time),
    restart: state.restart,
    activePlayers: state.players.map((p) => ({
      id: p.id,
      team: p.team,
      slot: p.slot,
      goalkeeperRole: p.goalkeeperRole,
      position: p.position,
    })),
    pendingSubstitutions: state.substitutionState?.pending,
  });
  writeFileSync(
    'docs/performance/PR171-engine-failures.json',
    JSON.stringify(
      {
        version: 1,
        sourceManifest: JSON.parse(
          readFileSync('../pr171-full/cohort-youth_native-false.json', 'utf8'),
        ).manifest,
        policy:
          'All strong/weak attempts retained. Prefix statistics are censored and excluded from complete-match distributions. No restart repair or result substitution.',
        rows,
      },
      null,
      2,
    ),
  );
}
