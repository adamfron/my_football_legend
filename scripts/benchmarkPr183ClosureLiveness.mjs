import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import console from 'node:console';
import { digest, pr183SourceHash } from './pr183Evidence.mjs';
const initial = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr183-evidence/liveness-blocker.json.gz')),
).state;
const rows = [];
for (const [label, root] of [
  ['before', '../pr183-rejected'],
  ['after', '.'],
]) {
  const load = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { stepTacticalMatchAfterDecisionProbe } = await load(
    'src/core/matchSimulation/matchSimulation.ts',
  );
  const { tacticalMatchStateSchema } = await load('src/core/matchSimulation/matchState.ts');
  let state = globalThis.structuredClone(initial),
    firstAction;
  for (let tick = 0; tick < 800; tick++) {
    state = stepTacticalMatchAfterDecisionProbe(state, 0.025);
    if (!firstAction && state.decisionIndex > initial.decisionIndex)
      firstAction = {
        at: state.time,
        elapsed: state.time - initial.time,
        action: state.latestAction,
        contact: state.lastAerialContact,
        ball: state.ball,
      };
  }
  tacticalMatchStateSchema.parse(state);
  rows.push({
    label,
    sourceHash: pr183SourceHash(root),
    inputHash: digest(initial),
    elapsed: state.time - initial.time,
    decisions: state.decisionIndex - initial.decisionIndex,
    firstAction,
    finalHash: digest(state),
    status: state.status,
    finalScenario: state.scenario,
  });
  if (label === 'after')
    writeFileSync(
      'docs/performance/pr183-evidence/closure-liveness-after.json.gz',
      gzipSync(JSON.stringify(state)),
    );
}
if (
  rows[0].decisions !== 0 ||
  !rows[1].firstAction ||
  rows[1].firstAction.action.type !== 'header' ||
  rows[1].firstAction.ball.ownerId
)
  throw Error('Liveness contact regression');
writeFileSync(
  'docs/performance/PR183-closure-liveness.json',
  JSON.stringify(
    {
      schema: 'mfl-pr183-closure-liveness-v1',
      definition:
        'Same complete saved failure; 800 unchanged .025s steps per version. First action uses real reachable contact, never a time-triggered rescue.',
      rows,
      fullContract:
        'Existing unchanged pr160PenaltyLiveness.test.ts additionally runs the original seed through an actual CPU half and a penalty.',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(
    rows.map((r) => ({
      version: r.label,
      decisions: r.decisions,
      firstActionSeconds: r.firstAction?.elapsed,
      scenario: r.finalScenario,
    })),
  ),
);
