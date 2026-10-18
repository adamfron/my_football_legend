import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createPr171Fixture } from './pr171Fixtures';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation';
import { pr172Manifest, pr172Hash } from './pr172Evidence';
let state = createPr171Fixture('senior_balanced', false).state;
let key = '',
  changedAt = 0;
for (let tick = 0; tick < 300000; tick++) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  const current = `${state.actionEventSequence}:${state.ball.ownerId}:${state.ballEpisode}:${state.restart?.phase}:${state.restart?.awardId}:${state.score.home}:${state.score.away}`;
  if (current !== key) {
    key = current;
    changedAt = state.time;
  }
  if (state.time - changedAt > 120) {
    writeFileSync(
      'docs/performance/pr174-experiments/PR174-G-blocker-state.json.gz',
      gzipSync(JSON.stringify(state)),
    );
    writeFileSync(
      'docs/performance/PR174-G-blocker.json',
      JSON.stringify(
        {
          manifest: pr172Manifest(),
          hash: pr172Hash(state),
          changedAt,
          time: state.time,
          key,
          restart: state.restart,
          diagnostic: state.restartLivenessDiagnostics?.at(-1),
          ball: state.ball,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      JSON.stringify({ time: state.time, changedAt, restart: state.restart, ball: state.ball }),
    );
    break;
  }
  if (state.status === 'full_time') {
    console.log('completed');
    break;
  }
}
