import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

const input = process.argv[2] ?? '../pr158-integrity.json';
const output = process.argv[3] ?? 'docs/performance/PR158-integrity-summary.json';
const data = JSON.parse(readFileSync(input, 'utf8'));
assert.equal(data.simulations.length, 3);
assert.equal(data.shotOwnership.length, 18);
let comparedTicks = 0,
  opportunities = 0,
  identities = 0,
  blockedProposals = 0;
for (const row of data.shotOwnership) {
  assert.ok(
    row.footballStateUnchanged &&
      row.humanShotReleased &&
      row.humanNpcLaunchParity &&
      row.humanNpcRngParity,
  );
  assert.equal(row.blockedRngDraws, 0);
  blockedProposals += row.proposalsBlocked;
}
const simulations = data.simulations.map((row) => {
  assert.ok(row.normalDevCaptureCanonicalParity && row.normalDevCaptureRngParity);
  assert.equal(row.identities.length, 22);
  const compactIdentities = row.identities.map((identity) => {
    assert.ok(identity.disabledCanonicalParity && identity.disabledRngParity);
    assert.ok(
      identity.enabledPrefix.canonicalParity &&
        identity.enabledPrefix.canonicalDrawSequencePreserved,
    );
    identities++;
    comparedTicks += identity.enabledPrefix.comparedTicks;
    if (identity.enabledPrefix.opportunity) opportunities++;
    return {
      playerId: identity.playerId,
      disabledCanonicalHash: identity.disabled.canonicalHash,
      disabledRandomStreamHash: identity.disabled.randomStreamHash,
      disabledRandomCalls: identity.disabled.randomCalls,
      enabledPrefix: identity.enabledPrefix,
    };
  });
  const modes = Object.fromEntries(
    ['normal', 'dev', 'capture'].map((mode) => {
      const { elapsedMs: _elapsed, ...facts } = row[mode];
      void _elapsed;
      return [mode, facts];
    }),
  );
  return {
    seed: row.seed,
    normalDevCaptureCanonicalParity: true,
    normalDevCaptureRngParity: true,
    modes,
    identities: compactIdentities,
  };
});
assert.equal(identities, 66);
const report = {
  sourceFingerprint: data.sourceFingerprint,
  config: data.config,
  fixedStepSeconds: data.fixedStepSeconds,
  exclusions: data.exclusions,
  rngDefinition: data.rngDefinition,
  counters: {
    identities,
    comparedTicks,
    genuineDecisionOpportunities: opportunities,
    shotLaunchParityCells: data.shotOwnership.length,
    blockedProposals,
    blockedCanonicalRngDraws: 0,
  },
  checks: {
    disabledIdentityParity: true,
    enabledPrefixParity: true,
    normalDevCaptureCanonicalParity: true,
    normalDevCaptureRngParity: true,
    selectedHumanNpcShotParity: true,
  },
  shotOwnership: data.shotOwnership,
  simulations,
  timingPolicy:
    'This integrity run may overlap other workers. Elapsed times are intentionally omitted; see the separate isolated performance comparison.',
};
writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, counters: report.counters }));
