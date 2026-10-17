import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createPr171Fixture, PR171_COHORT } from './pr171Fixtures';
import {
  FIXED_MATCH_DT,
  startSecondHalf,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
const rows: unknown[] = [];
for (const file of readdirSync('../pr171-full').filter((p) => p.startsWith('cohort-'))) {
  const receipt = JSON.parse(readFileSync(`../pr171-full/${file}`, 'utf8'));
  if (receipt.observed.status === 'full_time' || receipt.fixture.family.includes(':')) continue;
  const family = PR171_COHORT.find((f) => f === receipt.fixture.family)!;
  let { state } = createPr171Fixture(family, receipt.fixture.reversed);
  while (!['full_time', 'abandoned'].includes(state.status ?? '') && state.time < 7200) {
    if (state.status === 'half_time') state = startSecondHalf(state);
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
  }
  const finalHash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
  if (finalHash !== receipt.observed.finalStateHash)
    throw new Error('Censored disabled-observer replay diverged');
  writeFileSync(
    `../pr171-censored-${family}-${receipt.fixture.reversed}.json`,
    JSON.stringify(state),
  );
  rows.push({
    fixture: receipt.fixture,
    finalStateHash: finalHash,
    completeCanonicalStateEqualWithObserversDisabled: true,
    status: state.status,
    time: state.time,
    scenario: state.scenario,
    restart: state.restart,
    timekeeping: state.timekeeping,
    stoppageLedger: state.stoppageLedger,
    pendingSubstitutions: state.substitutionState?.pending,
    ball: state.ball,
  });
  writeFileSync(
    'docs/performance/PR171-censored-replays.json',
    JSON.stringify({ version: 1, rows }, null, 2),
  );
  console.log(`reproduced ${family} ${receipt.fixture.reversed}`);
}
