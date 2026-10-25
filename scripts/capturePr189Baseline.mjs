import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import process from 'node:process';
import console from 'node:console';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  capturePathologicalState,
  restorePathologicalState,
} from '../src/core/matchSimulation/pathologicalReplay.ts';

const sha = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const engineRoot = process.argv.find((v) => v.startsWith('--engine-root='))?.slice(14) ?? '.';
const frozen = JSON.parse(readFileSync('docs/performance/PR188-evidence-index.json'));
for (const file of frozen.source) {
  const actual = createHash('sha256')
    .update(readFileSync(resolve(engineRoot, file.path), 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex');
  if (actual !== file.sha256) throw Error(`Not frozen PR188 source: ${file.path}`);
}
const { stepTacticalMatchAfterDecisionProbe: step, startSecondHalf } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/matchSimulation.ts'))
);
const { withBoundedObserver } = await import(
  pathToFileURL(resolve(engineRoot, 'src/core/matchSimulation/boundedIntelligence.ts'))
);
const receipt = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const saved = JSON.parse(gunzipSync(readFileSync(receipt.archive)));
const root =
  process.argv.find((v) => v.startsWith('--output-root='))?.slice(14) ?? 'docs/performance/pr189';
mkdirSync(root, { recursive: true });
if (existsSync(`${root}/baseline.json`)) throw Error('Preserve existing baseline');
const sourceCommit = 'a74be9ee846ac4958fd67e42795cf3d86946e937';
let state = saved.input,
  stationary = 0,
  maxStationary = 0,
  ticks = 0;
const captures = [],
  traces = [],
  thresholds = new Set();
const cpu = process.cpuUsage(),
  started = performance.now();
let replay;
const run = (s, n, observed) => {
  const events = [];
  s = withBoundedObserver(
    observed
      ? (t) => {
          events.push(t);
        }
      : undefined,
    () => {
      for (let i = 0; i < n; i++) s = step(s, 0.025);
      return s;
    },
  );
  return { state: s, hash: sha(s), events: sha(events) };
};
withBoundedObserver(
  (t) => {
    if (state.time > 794.9 && state.time < 796.3 && t.actorId === 'geometry:anchor:5')
      traces.push(t);
  },
  () => {
    while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
      if (state.status === 'half_time') state = startSecondHalf(state);
      const previous = state;
      state = step(state, 0.025);
      const actor = state.players.find((p) => p.id === state.ball.ownerId);
      stationary =
        actor &&
        previous.ball.ownerId === actor.id &&
        Math.hypot(actor.velocity.x, actor.velocity.y) < 0.35
          ? stationary + 0.025
          : 0;
      maxStationary = Math.max(maxStationary, stationary);
      for (const threshold of [0, 20, 60, 300, 1200, 1984]) {
        if (
          thresholds.has(threshold) ||
          state.time < 775 ||
          state.ball.ownerId !== 'geometry:anchor:5' ||
          stationary < threshold
        )
          continue;
        thresholds.add(threshold);
        const capture = capturePathologicalState(
          state,
          sourceCommit,
          `PR188 real WW/A stationary ${threshold}s`,
        );
        const path = `${root}/baseline-${threshold}s.json.gz`;
        writeFileSync(path, gzipSync(JSON.stringify(capture)));
        captures.push({ path, at: state.time, stationary, stateSha256: sha(capture.state) });
        if (threshold === 20) {
          const direct = run(JSON.parse(JSON.stringify(state)), 800, true);
          const restored = run(restorePathologicalState(capture), 800, true);
          const bare = run(restorePathologicalState(capture), 800, false);
          replay = {
            ticks: 800,
            direct: direct.hash,
            restored: restored.hash,
            bare: bare.hash,
            eventHashes: [direct.events, restored.events],
            equal:
              direct.hash === restored.hash &&
              direct.hash === bare.hash &&
              direct.events === restored.events,
          };
          writeFileSync(`${root}/baseline-replay.json`, JSON.stringify(replay, null, 2) + '\n');
          console.log(JSON.stringify({ capture: path, replay }));
        }
      }
      if (++ticks % 32000 === 0) console.log(`baseline ${state.time.toFixed(2)}s`);
    }
  },
);
const result = {
  schemaVersion: 1,
  sourceCommit,
  fixture: receipt.fixture,
  inputSha256: sha(saved.input),
  previousInputSha256: receipt.inputSha256,
  ticks,
  status: state.status,
  maxStationary,
  finalStateSha256: sha(state),
  historicalFinalStateSha256: receipt.finalStateSha256,
  captures,
  replay,
  cpu: process.cpuUsage(cpu),
  wallMs: performance.now() - started,
  rssBytes: process.memoryUsage().rss,
};
writeFileSync(`${root}/baseline.json`, JSON.stringify(result, null, 2) + '\n');
writeFileSync(`${root}/baseline-trace.json.gz`, gzipSync(JSON.stringify(traces)));
console.log(JSON.stringify(result));
if (!replay?.equal || Math.abs(maxStationary - 1984.7) > 0.1) process.exitCode = 1;
