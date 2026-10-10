import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform } from 'node:os';
import { createCanonicalWorldDatabase } from './createCanonicalWorldDatabase';
import { createSingleMatchSession } from '../src/core/singleMatch';
import {
  createTacticalMatch,
  FIXED_MATCH_DT,
  stepTacticalMatchAfterDecisionProbe,
} from '../src/core/matchSimulation/matchSimulation';
import { MatchReplayHistory } from '../src/core/matchSimulation/matchReplay';
import { PresentationContextHistory } from '../src/app/match/tacticalRenderer/contextHistory';
import { replaySnapshotToFrame, sampleReplayFrame } from '../src/app/match/tacticalRenderer/replay';
import { derivePlayerPose } from '../src/app/match/tacticalRenderer/animation';

const world = createCanonicalWorldDatabase();
const session = createSingleMatchSession(world, {
  homeClubId: world.clubs[0]!.id,
  awayClubId: world.clubs[1]!.id,
  seed: 'pr161-observer-cost',
  control: { mode: 'spectator' },
});
const run = (observed: boolean, ticks: number) => {
  let state = createTacticalMatch(session);
  state.playerAgencyEnabled = false;
  const replay = new MatchReplayHistory();
  const context = new PresentationContextHistory();
  let replayCaptureMs = 0;
  const started = performance.now();
  for (let tick = 0; tick < ticks; tick++) {
    state = stepTacticalMatchAfterDecisionProbe(state, FIXED_MATCH_DT);
    if (observed) {
      const before = performance.now();
      replay.observe(state);
      replayCaptureMs += performance.now() - before;
      context.observe(state);
    }
  }
  const elapsedMs = performance.now() - started;
  const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex');
  const frames = context.leadIn(state.time, 6);
  let poses = 0;
  const playbackStarted = performance.now();
  if (observed && frames.length > 1) {
    for (let repeat = 0; repeat < 2000; repeat++) {
      const atMs =
        frames[0]!.timestampMs +
        ((frames.at(-1)!.timestampMs - frames[0]!.timestampMs) * (repeat % 120)) / 120;
      const frame = sampleReplayFrame(frames, atMs)!;
      for (const player of frame.players) {
        derivePlayerPose(player, atMs);
        poses++;
      }
    }
  }
  const playbackMs = performance.now() - playbackStarted;
  // Conversion only reads independent recorded values; statistics and state remain unchanged.
  for (const window of replay.snapshot().windows ? replay.listWindows() : []) {
    const recording = replay.getWindow(window.replayKey);
    if (recording) recording.frames.map(replaySnapshotToFrame);
  }
  assert.equal(createHash('sha256').update(JSON.stringify(state)).digest('hex'), hash);
  return {
    observed,
    canonicalSeconds: state.time,
    elapsedMs,
    hash,
    replayCaptureMs,
    context: context.snapshot(),
    replay: replay.snapshot(),
    playbackMs,
    poses,
  };
};
run(false, 400);
run(true, 400);
const runs = [
  run(false, 4800),
  run(true, 4800),
  run(true, 4800),
  run(false, 4800),
  run(false, 4800),
  run(true, 4800),
];
assert.equal(new Set(runs.map((run) => run.hash)).size, 1, 'Observers changed canonical football');
const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const unobservedMs = median(runs.filter((run) => !run.observed).map((run) => run.elapsedMs));
const observedMs = median(runs.filter((run) => run.observed).map((run) => run.elapsedMs));
const report = {
  seed: session.setup.seed,
  dt: FIXED_MATCH_DT,
  ticksPerRun: 4800,
  environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model },
  methodology:
    'Three alternating 120-second pairs after short warmup. Observers include bounded replay and context capture, never Three.js. Playback is interpolation plus pure poses, excluding WebGL.',
  limitation:
    'Single deterministic scene; Node CPU timings do not establish browser FPS or league realism.',
  canonicalInvariant: true,
  observerOverheadPercent: (observedMs / unobservedMs - 1) * 100,
  runs,
};
mkdirSync('docs/performance', { recursive: true });
writeFileSync(
  'docs/performance/PR161-presentation-performance.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.info(
  JSON.stringify({
    canonicalInvariant: true,
    unobservedMs,
    observedMs,
    observerOverheadPercent: report.observerOverheadPercent,
  }),
);
