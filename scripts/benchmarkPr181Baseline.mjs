import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { PRIMARY_DECISION_POLICIES } from '../src/core/matchSimulation/decisionPolicyConfig.ts';
const baseline = process.argv.find((a) => a.startsWith('--baseline-root='))?.slice(16);
if (!baseline) throw Error('--baseline-root is required');
const hash = (s) => createHash('sha256').update(JSON.stringify(s)).digest('hex');
const cases = JSON.parse(
  gunzipSync(readFileSync('docs/performance/pr181-evidence/controlled-inputs.json.gz')),
).filter((f) =>
  ['depth', 'false-nine', 'no-threat', 'isolated', 'cross-target', 'aerial'].includes(f.scenario),
);
const rows = [];
for (const [label, root] of [
  ['before', baseline],
  ['after', '.'],
]) {
  const load = (p) => import(pathToFileURL(resolve(root, p)).href);
  const position = await load('src/core/matchSimulation/tacticalPositioning.ts');
  const actions = await load('src/core/matchSimulation/matchActions.ts');
  const sim = await load('src/core/matchSimulation/matchSimulation.ts');
  const { pr172SourceHash } = await load('scripts/pr172Evidence.ts');
  for (const input of cases)
    for (const policy of PRIMARY_DECISION_POLICIES) {
      let state = globalThis.structuredClone(input.state);
      state.decisionPolicy = policy;
      const initialHash = hash(state),
        targets = position
          .deriveTacticalTargets(state)
          .map((p) => ({ id: p.id, position: p.position, target: p.target, ideal: p.idealTarget }));
      const initialRanks = state.ball.ownerId
        ? actions.rankAvailableActionsForAI(state, state.ball.ownerId).slice(0, 5)
        : [];
      const sequence = [],
        start = state.time;
      for (let i = 0; i < 120; i++) {
        state = sim.stepTacticalMatchAfterDecisionProbe(state, 0.025);
        if (i % 20 === 0)
          sequence.push({
            time: state.time,
            positions: state.players.map((p) => ({
              id: p.id,
              position: p.position,
              velocity: p.velocity,
            })),
            ball: state.ball,
            pass: state.lastPassDiagnostic,
            aerial: state.lastAerialContact,
            latestAction: state.latestAction,
          });
      }
      rows.push({
        label,
        scenario: input.scenario,
        policy,
        sourceHash: pr172SourceHash(root),
        initialHash,
        targets,
        initialRanks,
        elapsed: state.time - start,
        finalHash: hash(state),
        events: state.actionEvents,
        sequence,
      });
    }
}
for (const before of rows.filter((r) => r.label === 'before')) {
  const after = rows.find(
    (r) => r.label === 'after' && r.scenario === before.scenario && r.policy === before.policy,
  );
  if (before.initialHash !== after.initialHash) throw Error('Counterfactual input mismatch');
}
writeFileSync(
  'docs/performance/pr181-evidence/baseline-counterfactuals.json.gz',
  gzipSync(
    JSON.stringify({
      schema: 'mfl-pr181-counterfactual-v1',
      rows,
      method:
        'Identical complete frozen physical inputs, original PR180 versus PR181 targets/ranks and three-second canonical continuations; dependent causal probes, not independent validation.',
    }),
  ),
);
console.log(JSON.stringify({ rows: rows.length, equalInputs: true }));
