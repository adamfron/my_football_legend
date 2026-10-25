import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import { restorePathologicalState } from '../src/core/matchSimulation/pathologicalReplay.ts';
import { withBoundedObserver } from '../src/core/matchSimulation/boundedIntelligence.ts';
import { PassLifecycleDiagnostics } from '../src/core/matchSimulation/passLifecycleDiagnostics.ts';
const root = 'docs/performance/pr191',
  output = `${root}/captured-transfer.json`,
  check = process.argv.includes('--check');
if (!check && existsSync(output)) throw Error('Refusing to overwrite ' + output);
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const run = (capture, body, observed) => {
  let state = restorePathologicalState(capture);
  if (!body) delete state.experimentalBodyContacts;
  if (body) state.experimentalBodyContacts = { version: 'body-v1', readyAt: {}, locks: [] };
  const observer = new PassLifecycleDiagnostics(),
    events = [],
    contacts = [],
    trace = [],
    ids = new Set();
  withBoundedObserver(
    observed
      ? (t) => {
          events.push(t);
          observer.trace(t);
        }
      : undefined,
    () => {
      for (let tick = 0; tick < 320; tick++) {
        const before = state;
        state = step(state, 0.025);
        if (observed) observer.observe(before, state);
        const last = state.experimentalBodyContacts?.last,
          key = last ? last.playerId + ':' + last.at : null;
        if (last && !ids.has(key)) {
          ids.add(key);
          contacts.push(last);
        }
        if (tick % 8 === 0 || last?.at > before.time)
          trace.push({
            at: state.time,
            ball: state.ball,
            actor: state.players.find(
              (p) => p.id === (last?.playerId ?? capture.state.receptionPreparation?.actorId),
            )?.position,
          });
      }
    },
  );
  return {
    finalHash: sha(state),
    eventHash: sha(events),
    diagnosticsHash: sha(observer.snapshot()),
    contacts,
    trace,
    owner: state.ball.ownerId ?? null,
    score: state.score,
  };
};
const rows = [];
for (const file of readdirSync(root)
  .filter((f) => /^capture-.*\.json.gz$/.test(f))
  .sort()) {
  const bytes = readFileSync(`${root}/${file}`),
    capture = JSON.parse(gunzipSync(bytes));
  for (const body of [false, true]) {
    const a = run(capture, body, true),
      b = run(capture, body, true),
      off = run(capture, body, false);
    if (
      sha(a) !== sha(b) ||
      a.finalHash !== off.finalHash ||
      sha(a.contacts) !== sha(off.contacts) ||
      sha(a.trace) !== sha(off.trace)
    )
      throw Error('Replay drift ' + file);
    rows.push({
      capture: `${root}/${file}`,
      inputHash: sha(capture.state),
      captureHash: createHash('sha256').update(bytes).digest('hex'),
      mode: body ? 'body' : 'default',
      observerNeutral: true,
      ...a,
    });
  }
}
const result = {
  schemaVersion: 1,
  classification:
    'genuine captured development states; only experimental contact configuration differs',
  ticks: 320,
  stepSeconds: 0.025,
  rows,
};
if (check) {
  if (sha(JSON.parse(readFileSync(output))) !== sha(result)) throw Error('Recorded replay drift');
} else writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(
  JSON.stringify({
    captures: rows.length / 2,
    newContacts: rows.filter((r) => r.mode === 'body').reduce((n, r) => n + r.contacts.length, 0),
    observerNeutral: true,
  }),
);
