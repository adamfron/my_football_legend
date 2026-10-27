import process from 'node:process';
import console from 'node:console';
import { readdirSync } from 'node:fs';
import { captureCalibrationSnapshot } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { argumentsMap, read, hash, finish, sourceIdentity } from './pr197Evidence.mjs';
const args = argumentsMap(),
  version = args.get('version') ?? 'v1',
  identity = sourceIdentity(),
  rows = [];
for (const name of readdirSync('docs/performance/pr196/harvest')
  .filter((p) => p.endsWith('baseline-v1.json.gz'))
  .sort()) {
  const run = read('docs/performance/pr196/harvest/' + name),
    capture = run.captures[0];
  if (!capture) continue;
  const saved = read(capture.path),
    state = saved.state,
    actorId = saved.scene.observerId;
  const before = captureCalibrationSnapshot(state, actorId),
    afterState = {
      ...globalThis.structuredClone(state),
      experimentalHeightAwarePassing: true,
      experimentalDefensiveReception: true,
      experimentalReceiverAnticipation: true,
    };
  const after = captureCalibrationSnapshot(afterState, actorId);
  const requests = new Map();
  for (const snapshot of [before, after]) {
    for (const p of snapshot.policyRankings.filter((p) =>
      ['state-value-v1', 'phase-role-hybrid-v1'].includes(p.policy),
    ))
      for (const x of p.actions.slice(0, 1)) requests.set(hash(x.action), x.action);
    for (const p of snapshot.boundedDecisions) {
      const c = snapshot.candidates.find((c) => c.id === p.selectedCandidateId);
      if (c) requests.set(hash(c.action), c.action);
    }
  }
  const physical = [];
  for (const [key, action] of requests)
    for (const [model, s] of [
      ['baseline', state],
      ['combined', afterState],
    ]) {
      const result = runCanonicalOutcomeTrial(s, action, 8, undefined, 'original-delivery-v3');
      physical.push({
        key,
        action,
        model,
        outcome: result.outcome,
        finalHash: hash(result.final),
        samplesHash: hash(result.samples),
      });
    }
  rows.push({
    inputPath: capture.path,
    run: name,
    actorId,
    inputHash: hash(state),
    boundedMenuInvariant: hash(before.candidates) === hash(after.candidates),
    boundedSceneInvariant: hash(before.scene) === hash(after.scene),
    before: {
      candidates: before.candidates,
      decisions: before.boundedDecisions,
      rankings: before.policyRankings,
    },
    after: {
      candidates: after.candidates,
      decisions: after.boundedDecisions,
      rankings: after.policyRankings,
    },
    physical,
  });
  console.log('candidate audit', rows.length, name);
}
finish(
  `docs/performance/pr197/candidates-${version}.json.gz`,
  {
    schema: 'pr197-candidates-v1',
    source: identity,
    selection:
      'First captured original PR196 baseline development state per design/policy, chosen without reading continuation. Full-world alternatives remain privileged diagnostics.',
    rows,
  },
  { memory: process.memoryUsage(), cpu: process.cpuUsage() },
  args.has('check'),
);
