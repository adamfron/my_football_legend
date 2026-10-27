import process from 'node:process';
import console from 'node:console';
import {
  createCalibrationFixture,
  captureCalibrationSnapshot,
} from '../src/core/matchSimulation/assumptionCalibration.ts';
import { runCanonicalOutcomeTrial } from '../src/core/matchSimulation/canonicalOutcome.ts';
import { playerContactGeometry } from '../src/core/matchSimulation/ballContactGeometry.ts';
import { sourceIdentity, finish, argumentsMap, hash } from './pr197Evidence.mjs';
const args = argumentsMap(),
  identity = sourceIdentity(),
  rows = [];
for (const metres of [21, 22, 23, 35, 36, 37, 42, 55, 68, 69])
  for (const sample of [0, 1]) {
    const f = createCalibrationFixture({
      scenario: 'safe_pass',
      attacker: 80,
      defender: 60,
      seed: `pr197-candidate-boundary-${sample}`,
    });
    const a = f.state.players.find((p) => p.id === f.actorId),
      r = f.state.players.find((p) => p.id === f.receiverId);
    a.position = { x: 20, y: 34 };
    a.target = { ...a.position };
    a.anchor = { ...a.position };
    a.neutralAnchor = { ...a.position };
    r.position = { x: 20 + metres, y: 34 };
    r.target = { ...r.position };
    r.anchor = { ...r.position };
    r.neutralAnchor = { ...r.position };
    f.state.ball = { ...f.state.ball, ...playerContactGeometry(a).rightFoot };
    f.action.target = { ...r.position };
    f.action.intent = metres > 42 ? 'direct' : metres > 8 ? 'progressive' : 'support';
    f.action.delivery = metres > 35 ? 'lofted' : 'ground';
    f.state.experimentalDefensiveReception = true;
    const snapshot = captureCalibrationSnapshot(f.state, a.id),
      trial = runCanonicalOutcomeTrial(f.state, f.action, 8, undefined, 'original-delivery-v3');
    const actual = [];
    for (const p of snapshot.policyRankings.filter((p) =>
      ['state-value-v1', 'phase-role-hybrid-v1'].includes(p.policy),
    ))
      actual.push({
        policy: p.policy,
        receiverOptions: p.actions.filter(
          (c) => c.action.type === 'pass' && c.action.receiverId === r.id,
        ),
      });
    rows.push({
      metres,
      sample,
      inputHash: hash(f.state),
      actor: a.position,
      receiver: r.position,
      observed: snapshot.scene.visible.find((p) => p.id === r.id) ?? null,
      boundedOptions: snapshot.candidates.filter(
        (c) => c.action.type === 'pass' && c.action.receiverId === r.id,
      ),
      boundedDecisions: snapshot.boundedDecisions,
      fullWorld: actual,
      forcedRequest: f.action,
      outcome: trial.outcome,
      finalHash: hash(trial.final),
      samplesHash: hash(trial.samples),
      classification:
        'Controlled forced physical request; absent bounded sighting is not labelled a permitted missed option.',
    });
  }
finish(
  `docs/performance/pr197/candidate-boundaries-${args.get('version') ?? 'v1'}.json.gz`,
  { schema: 'pr197-candidate-boundaries-v1', source: identity, rows },
  { memory: process.memoryUsage(), cpu: process.cpuUsage() },
  args.has('check'),
);
console.log('candidate boundary conditions', rows.length);
