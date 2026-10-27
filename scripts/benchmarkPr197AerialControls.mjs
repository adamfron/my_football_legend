import process from 'node:process';
import console from 'node:console';
import { createCalibrationFixture } from '../src/core/matchSimulation/assumptionCalibration.ts';
import { traceRequest } from './pr197Trace.mjs';
import { sourceIdentity, argumentsMap, finish } from './pr197Evidence.mjs';
const args = argumentsMap(),
  identity = sourceIdentity(),
  rows = [];
for (const policy of [
  'legacy-pr176',
  'state-value-v1',
  'phase-role-hybrid-v1',
  'opportunity-driven-v1',
  'hierarchical-intent-v1',
  'contextual-judgment-v1',
]) {
  const f = createCalibrationFixture({
    scenario: 'long_pass',
    attacker: 80,
    defender: 100,
    seed: 'pr197-aerial-positive',
  });
  f.state.decisionPolicy = policy;
  f.state.experimentalDefensiveReception = true;
  const d = f.state.players.find((p) => p.id === f.defenderId);
  d.position = { x: 78, y: 26 };
  d.target = { ...d.position };
  const trial = traceRequest(f);
  rows.push({ policy, ...trial.row });
}
finish(
  `docs/performance/pr197/aerial-controls-${args.get('version') ?? 'v1'}.json.gz`,
  {
    schema: 'pr197-aerial-controls-v1',
    source: identity,
    method:
      'Ordinary lofted request; both teams autonomous after release. Strong anticipating defender, unchanged ratings. B/R3 and legacy preserve a real header redirect; bounded control-first restrictions are recorded.',
    rows,
  },
  { memory: process.memoryUsage(), cpu: process.cpuUsage() },
  args.has('check'),
);
console.log(
  'aerial positive/negative controls',
  rows.map((r) => ({ policy: r.policy, first: r.events[0]?.afterAction?.type })),
);
