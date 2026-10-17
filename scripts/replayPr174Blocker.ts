import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pr172Hash, pr172SourceHash } from './pr172Evidence';
import { distance } from '../src/core/matchSimulation/matchSpace';
import type { TacticalMatchState } from '../src/core/matchSimulation/matchState';
const initial = JSON.parse(
  gunzipSync(
    readFileSync('docs/performance/pr174-experiments/PR174-G-blocker-state.json.gz'),
  ).toString(),
) as TacticalMatchState;
const rows = [];
for (const [label, root] of [
  ['G', resolve('../stage-G')],
  ['final', resolve('.')],
] as const) {
  const sim = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/matchSimulation.ts')).href
  )) as typeof import('../src/core/matchSimulation/matchSimulation');
  const laws = (await import(
    pathToFileURL(resolve(root, 'src/core/matchSimulation/restartLaws.ts')).href
  )) as typeof import('../src/core/matchSimulation/restartLaws');
  let state = structuredClone(initial),
    maxStep = 0,
    release: unknown = null;
  for (let tick = 0; tick < 1200; tick++) {
    const previous = state;
    state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
    maxStep = Math.max(
      maxStep,
      ...state.players.map((p) =>
        distance(p.position, previous.players.find((old) => old.id === p.id)!.position),
      ),
    );
    if (state.ball.travelKind && !previous.ball.travelKind) {
      release = {
        at: state.time,
        elapsed: state.time - initial.time,
        kind: state.ball.travelKind,
        action: state.latestAction,
        legalBefore: laws.deriveRestartLegalReadiness(previous),
        marker: state.players.find((p) => p.id === 'footballer_pro_9_13'),
      };
      break;
    }
  }
  rows.push({
    label,
    sourceHash: pr172SourceHash(root),
    initialHash: pr172Hash(initial),
    finalHash: pr172Hash(state),
    time: state.time,
    maxStep,
    release,
    readiness: laws.deriveRestartLegalReadiness(state),
    ball: state.ball,
  });
}
if (rows[0]!.release !== null || !rows[1]!.release || rows[1]!.maxStep > 0.5)
  throw new Error('Frozen restart recovery not proven');
writeFileSync(
  'docs/performance/PR174-restart-recovery.json',
  JSON.stringify(
    {
      method:
        'Identical retained G canonical state; 30s ordinary physics, no forced release, placement, player relocation or legal bypass. Stop after actual new ball flight.',
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify(rows.map((r) => ({ label: r.label, release: r.release, maxStep: r.maxStep }))),
);
