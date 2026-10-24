import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import console from 'node:console';
import process from 'node:process';
import { performance } from 'node:perf_hooks';
import {
  stepTacticalMatchAfterDecisionProbe,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { inspectBoundedAction } from '../src/core/matchSimulation/boundedIntelligence.ts';
import {
  derivePressingPlan,
  deriveDefensiveContext,
  enumerateDefensiveChallengeActions,
} from '../src/core/matchSimulation/defensiveChallenges.ts';
import { distance } from '../src/core/matchSimulation/matchSpace.ts';

const path = 'docs/performance/PR188-possession-diagnosis.json';
if (existsSync(path)) throw Error('Preserve existing diagnosis');
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' || v instanceof Uint8Array ? v : JSON.stringify(v))
    .digest('hex');
const receipt = JSON.parse(
  readFileSync(
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  ),
);
const sourceSha256 = sha(
  readdirSync('src', { recursive: true })
    .map((p) => p.replaceAll('\\', '/'))
    .filter((p) => /\.(ts|tsx)$/.test(p) && !p.includes('.test.'))
    .sort()
    .map((p) => ({
      path: `src/${p}`,
      sha256: sha(readFileSync(`src/${p}`, 'utf8').replaceAll('\r\n', '\n')),
    })),
);
if (sourceSha256 !== receipt.sourceSha256) throw Error('Source changed before diagnostic repeat');
const savedBytes = readFileSync(receipt.archive);
if (sha(savedBytes) !== receipt.archiveSha256) throw Error('Archived input changed');
const saved = JSON.parse(gunzipSync(savedBytes));
let state = saved.input;
const inputSha256 = sha(state);
let stationary = 0,
  openStationary = 0,
  maxStationary = 0,
  maxOpenStationary = 0,
  thresholds = new Set(),
  ticks = 0;
let maxAt = null,
  maxOpenAt = null;
const snapshots = [];
const cpu = process.cpuUsage(),
  start = performance.now();
while (!['full_time', 'abandoned'].includes(state.status) && state.time < 7200) {
  if (state.status === 'half_time') state = startSecondHalf(state);
  const before = state;
  state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
  if (before === state) throw Error(`Stalled at ${state.time}`);
  const actor = state.players.find((p) => p.id === state.ball.ownerId);
  const same = actor && state.ball.ownerId === before.ball.ownerId;
  const still = same && Math.hypot(actor.velocity.x, actor.velocity.y) < 0.35;
  stationary = still ? stationary + 0.025 : 0;
  const open = still && state.scenario === 'open_play' && !state.restart;
  openStationary = open ? openStationary + 0.025 : 0;
  if (!same) thresholds = new Set();
  const context = () => ({
    at: state.time,
    owner: actor?.id,
    scenario: state.scenario,
    restartPhase: state.restart?.phase ?? null,
  });
  if (stationary > maxStationary) {
    maxStationary = stationary;
    maxAt = context();
  }
  if (openStationary > maxOpenStationary) {
    maxOpenStationary = openStationary;
    maxOpenAt = context();
  }
  for (const threshold of [20, 60, 300, 1200]) {
    if (!actor || stationary < threshold || thresholds.has(threshold)) continue;
    thresholds.add(threshold);
    const snapshot = {
      threshold,
      stationary,
      openStationary,
      ...context(),
      actor: JSON.parse(JSON.stringify(actor)),
      ball: JSON.parse(JSON.stringify(state.ball)),
      bounded: inspectBoundedAction(state, actor),
      defenders: state.players
        .filter((p) => p.team !== actor.team)
        .sort((a, b) => distance(a.position, actor.position) - distance(b.position, actor.position))
        .slice(0, 3)
        .map((p) => ({
          id: p.id,
          position: p.position,
          velocity: p.velocity,
          facing: p.facing,
          plan: derivePressingPlan(state, p.id),
          context: deriveDefensiveContext(state, p.id),
          eligible: enumerateDefensiveChallengeActions(state, p.id),
        })),
    };
    snapshots.push(JSON.parse(JSON.stringify(snapshot)));
  }
  if (++ticks % 48000 === 0) console.log(`diagnosis: ${state.time.toFixed(2)}s`);
}
const result = {
  schemaVersion: 1,
  classification:
    'same frozen WW/A development input; diagnostic repeat, no new independent design',
  observedReceipt:
    'docs/performance/PR188-match-dev-ww-opportunity-driven-v1-full-observed-final-v1.json',
  sourceSha256,
  runnerSha256: sha(
    readFileSync('scripts/diagnosePr188Possession.mjs', 'utf8').replaceAll('\r\n', '\n'),
  ),
  inputSha256,
  finalStateSha256: sha(state),
  sameInput: inputSha256 === receipt.inputSha256,
  equalFinalState: sha(state) === receipt.finalStateSha256,
  observerContext:
    'Bounded trace and flow observers off; pure diagnostic inspections at fixed duration thresholds remain.',
  status: state.status,
  failure: receipt.failure,
  ticks,
  maxStationary,
  maxAt,
  maxOpenStationary,
  maxOpenAt,
  cpu: process.cpuUsage(cpu),
  wallMs: performance.now() - start,
  rssBytes: process.memoryUsage().rss,
  snapshots,
};
const bytes = gzipSync(JSON.stringify({ result, finalState: state }));
const archive = 'docs/performance/PR188-possession-diagnosis.json.gz';
writeFileSync(archive, bytes);
writeFileSync(
  path,
  JSON.stringify({ ...result, archive, archiveSha256: sha(bytes) }, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    path,
    equalFinalState: result.equalFinalState,
    maxStationary,
    maxOpenStationary,
    snapshots: snapshots.length,
  }),
);
if (!result.sameInput || !result.equalFinalState) process.exitCode = 1;
