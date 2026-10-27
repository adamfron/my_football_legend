import process from 'node:process';
import console from 'node:console';
import { readDevelopmentInput } from './pr193Evidence.mjs';
import { stepTacticalMatchAfterDecisionProbe as step } from '../src/core/matchSimulation/matchSimulation.ts';
import {
  sampleCanonicalOutcome,
  outcomeContractSchema,
  interpretCanonicalOutcome,
} from '../src/core/matchSimulation/canonicalOutcome.ts';
import { hash, receipt, sourceForReplay } from './pr196Evidence.mjs';
const output = 'docs/performance/pr196/restart-outcomes-v1.json.gz',
  rows = [],
  sourceArchive = sourceForReplay(output, process.argv.includes('--check'));
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of [
    'state-value-v1',
    'phase-role-hybrid-v1',
    'opportunity-driven-v1',
    'hierarchical-intent-v1',
    'contextual-judgment-v1',
  ]) {
    const { input } = readDevelopmentInput(design, policy);
    let s = globalThis.structuredClone(input),
      found = false;
    for (let tick = 0; tick < 400 && !found; tick++) {
      const before = s;
      s = step(s, 0.025);
      if (
        s.lastPassDiagnostic?.passId === before.lastPassDiagnostic?.passId ||
        s.currentAction?.type !== 'pass'
      )
        continue;
      const released = globalThis.structuredClone(s),
        pass = s.lastPassDiagnostic,
        actor = before.players.find((p) => p.id === pass.passerId);
      const contract = outcomeContractSchema.parse({
        version: 'original-delivery-v2',
        actorId: actor.id,
        receiverId: pass.intendedReceiverId,
        teamIds: before.players.filter((p) => p.team === actor.team).map((p) => p.id),
        opponentIds: before.players.filter((p) => p.team !== actor.team).map((p) => p.id),
        requestedAt: pass.releasedAt,
        releasedAt: pass.releasedAt,
        horizonAt: pass.releasedAt + 8,
        passId: pass.passId,
        shotId: null,
        previousShotId: before.ball.shot?.shotId ?? before.lastShot?.shotId ?? null,
        information: 'privileged_engineering_observer',
        conditionalOnRelease: true,
      });
      const samples = [sampleCanonicalOutcome(before, s)];
      for (let i = 0; i < 320; i++) {
        const previous = s;
        s = step(s, 0.025);
        samples.push(sampleCanonicalOutcome(previous, s));
      }
      const legacy = interpretCanonicalOutcome(
          { ...contract, version: 'original-delivery-v1' },
          samples,
        ),
        corrected = interpretCanonicalOutcome(contract, samples);
      rows.push({
        design,
        policy,
        inputHash: hash(before),
        releasedHash: hash(released),
        action: released.currentAction,
        contract,
        legacy,
        corrected,
        finalHash: hash(s),
        samplesHash: hash(samples),
        samples: samples.filter(
          (s, i) => i < 3 || i % 10 === 0 || s.contacts.length || i === samples.length - 1,
        ),
      });
      found = true;
    }
    if (!found)
      rows.push({ design, policy, status: 'no_autonomous_restart_pass_within_ten_seconds' });
  }
receipt(
  output,
  {
    schema: 'pr196-restart-outcome-contract-v1',
    sourceArchive,
    method:
      'First actual autonomous pass from frozen development kickoff, then ordinary autonomous continuation; identical physical samples interpreted under v1/v2. No intervention in football state or physical result.',
    rows,
  },
  process.argv.includes('--check'),
);
console.log(
  'Restart outcome semantics',
  rows.length,
  'policy/design conditions',
  rows.filter((r) => r.corrected?.directReceiverTouch).length,
  'intended receiver touches',
);
