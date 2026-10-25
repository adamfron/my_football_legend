import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { restorePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
const version = process.argv.find((v) => v.startsWith('--version='))?.slice(10) ?? 'spin-final';
const output = `docs/performance/pr190/captured-replay-${version}.json`,
  check = process.argv.includes('--check');
if (!check && existsSync(output)) throw Error(`Preserve ${output}`);
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const rows = [];
for (const file of readdirSync('docs/performance/pr189').filter((p) => p.endsWith('.json.gz'))) {
  const path = `docs/performance/pr189/${file}`,
    raw = readFileSync(path),
    value = JSON.parse(gunzipSync(raw));
  if (value.schemaVersion !== 1 || !value.state || !value.sourceCommit) continue;
  const run = (observed) => {
    let state = restorePathologicalState(value);
    const d = new PassLifecycleDiagnostics(),
      events = [];
    let firstPass = null;
    withBoundedObserver(
      observed
        ? (t) => {
            d.trace(t);
            events.push(t);
          }
        : undefined,
      () => {
        for (let tick = 0; tick < 320; tick++) {
          const before = state;
          state = step(state, 0.025);
          if (observed) d.observe(before, state);
          if (
            firstPass === null &&
            state.lastPassDiagnostic?.passId !== value.state.lastPassDiagnostic?.passId
          )
            firstPass = state.time - value.state.time;
        }
      },
    );
    return {
      stateSha256: sha(state),
      eventsSha256: sha(events),
      diagnosticsSha256: sha(observed ? d.snapshot() : []),
      firstPass,
    };
  };
  const direct = run(true),
    repeat = run(true),
    bare = run(false);
  if (!isDeepStrictEqual(direct, repeat) || direct.stateSha256 !== bare.stateSha256)
    throw Error(`Replay/observer drift: ${path}`);
  rows.push({
    path,
    captureSha256: sha(raw.toString('base64')),
    initialStateSha256: sha(value.state),
    ...direct,
    observerNeutral: true,
  });
}
const result = {
  schemaVersion: 1,
  ticks: 320,
  stepSeconds: 0.025,
  classification: 'actual PR189 captures; repeated state/event/pass-trace replay; observer on/off',
  rows,
};
if (check) {
  if (!isDeepStrictEqual(result, JSON.parse(readFileSync(output))))
    throw Error('PR190 captured replay changed');
} else writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ captures: rows.length, observerNeutral: true }));
