import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { readPr192Evidence } from './readPr192Evidence.mjs';
import {
  stepTacticalMatchAfterDecisionProbe as step,
  startSecondHalf,
} from '../src/core/matchSimulation/matchSimulation.ts';
import { NaturalMatchFlowDiagnostics } from '../src/core/matchSimulation/naturalMatchFlowDiagnostics.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const check = process.argv.includes('--check'),
  repair = process.argv.includes('--restore-captures');
const root = 'docs/performance/pr192/matches',
  rows = [];
for (const file of readdirSync(root).filter((p) => p.endsWith('.json'))) {
  const r = readPr192Evidence(root + '/' + file);
  if (!r.capture) continue;
  const old = JSON.parse(
    readFileSync(
      `docs/performance/PR188-match-dev-${r.design}-${r.policy}-full-observed-final-v1.json`,
    ),
  );
  let s = JSON.parse(gunzipSync(readFileSync(old.archive))).input;
  if (r.mode === 'recovery' || r.mode === 'combined') s.experimentalBallRecovery = true;
  if (r.mode === 'combined' || r.mode === 'flow') s.experimentalRestartPreparation = true;
  let ticks = 0;
  while (s.time < r.capture.at - 1e-8 && ++ticks < 300000) {
    if (s.status === 'half_time') s = startSecondHalf(s);
    s = step(s, 0.025);
  }
  if (hash(s) !== r.capture.sha256) throw Error('Genuine full-match prefix drift ' + file);
  const retained = existsSync(r.capture.path)
    ? JSON.parse(gunzipSync(readFileSync(r.capture.path)))
    : null;
  const restored = retained === null || hash(retained) !== hash(s);
  if (restored) {
    if (!repair) throw Error('Captured bytes do not match declared full-match prefix ' + file);
    if (retained)
      writeFileSync(
        r.capture.path.replace('.json.gz', '-rejected-overlap.json.gz'),
        gzipSync(JSON.stringify(retained)),
      );
    writeFileSync(r.capture.path, gzipSync(JSON.stringify(s)));
  }
  const run = (observed) => {
    let state = JSON.parse(JSON.stringify(s));
    const d = new NaturalMatchFlowDiagnostics();
    withBoundedObserver(
      observed
        ? (t) => {
            t.reason = 'mutated detached trace';
          }
        : undefined,
      () => {
        for (let i = 0; i < 320; i++) {
          const before = state;
          state = step(state, 0.025);
          if (observed) {
            d.observe(before, state);
            const snapshot = d.snapshot();
            snapshot.ticks = 999;
          }
        }
      },
    );
    return state;
  };
  const bare = run(false),
    seen = run(true),
    repeat = run(true);
  if (hash(bare) !== hash(seen) || hash(seen) !== hash(repeat))
    throw Error('Replay or observer drift ' + file);
  rows.push({
    match: root + '/' + file,
    inputHash: r.inputHash,
    at: r.capture.at,
    prefixTicks: ticks,
    capture: r.capture.path,
    captureStateHash: hash(s),
    finalStateHash: hash(bare),
    observerNeutral: true,
    deterministic: true,
    stepSeconds: 0.025,
    replayTicks: 320,
  });
  console.log(
    file,
    'genuine prefix and observer-neutral replay PASS',
    restored ? 'restored from exact prefix' : '',
  );
}
const result = { schema: 'mfl-pr192-genuine-replay-v1', rows };
const out = 'docs/performance/pr192/replay.json';
if (check) {
  if (JSON.stringify(readPr192Evidence(out)) !== JSON.stringify(result))
    throw Error('Replay evidence drift');
} else writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
