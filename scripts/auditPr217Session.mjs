import assert from 'node:assert/strict';
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
const root = 'docs/performance/pr217';
const bytes = gunzipSync(readFileSync(`${root}/user-session-original.json.gz`));
const d = JSON.parse(bytes),
  flow = d.matchFlowTelemetry,
  stats = d.canonicalStatistics;
const sum = (key) => stats.players.reduce((n, p) => n + p[key], 0);
const rows = [...flow.passOutcomes].sort((a, b) => a.passId.localeCompare(b.passId, 'en'));
assert.equal(rows.length, new Set(rows.map((p) => p.passId)).size);
assert.ok(rows.every((p) => stats.observedPassAttemptIds.includes(p.passId)));
const count = (list, key) =>
  Object.fromEntries(
    [...new Set(list.map((p) => p[key]))]
      .sort()
      .map((k) => [k, list.filter((p) => p[key] === k).length]),
  );
const receipt = {
  schema: 'pr217-user-session-audit-v1',
  originalBytesSha256: createHash('sha256').update(bytes).digest('hex'),
  metadata: d.metadata,
  originalDuration: d.duration,
  canonicalAttempts: sum('passesAttempted'),
  canonicalCompletions: sum('passesCompleted'),
  ledgerResults: count(rows, 'outcome'),
  predictedCompletionMean:
    rows.reduce((n, p) => n + (p.selection?.expectedCompletion ?? 0), 0) /
    rows.filter((p) => p.selection).length,
  physicalSelections: d.physicalExecutionWitnesses['pending-low-pass'],
  physicalContacts: d.physicalExecutionWitnesses['prepared-kick'],
  physicalMisses: d.physicalExecutionWitnesses['missed-kick'],
  physicalInterruptions: d.physicalExecutionWitnesses['interrupted-kick'],
  physicalCancellations: d.physicalExecutionWitnesses['cancelled-kick'],
  identityReconciliation: {
    releasedPendingPassIds: rows
      .filter((p) => p.passId.includes(':pending-strike:'))
      .map((p) => p.passId),
    releasedOtherPassIds: rows
      .filter((p) => !p.passId.includes(':pending-strike:'))
      .map((p) => p.passId),
    missingCanonicalAttempts: rows
      .filter((p) => !stats.observedPassAttemptIds.includes(p.passId))
      .map((p) => p.passId),
    limitation:
      'The original export omits per-pass actualReceiverId, contact points, credit reason, and missed-strike identities. The 35 completion exclusions cannot be assigned retrospectively to individual passes without inventing evidence.',
  },
  stages: [
    {
      stage: 'option_evaluated',
      eligible: null,
      attempted: null,
      completed: null,
      interrupted: null,
      failed: null,
      unresolved: null,
      excluded: null,
      evidence: 'ranking evaluations not exported',
    },
    {
      stage: 'pending_low_pass_selected_and_attempted',
      eligible: 396,
      attempted: 396,
      completed: 107,
      interrupted: 8,
      failed: 281,
      unresolved: 0,
      excluded: 202,
      evidence:
        'aggregate witnesses; failed includes 280 misses and one cancellation; 202 other released passes are outside this physical family',
    },
    {
      stage: 'physical_release',
      eligible: 309,
      attempted: 309,
      completed: 309,
      interrupted: 0,
      failed: 0,
      unresolved: 0,
      excluded: 0,
      evidence:
        '309 exact canonical pass identities; 107 pending contacts plus 202 historical releases',
    },
    {
      stage: 'receiving_area_reached',
      eligible: 309,
      attempted: null,
      completed: null,
      interrupted: null,
      failed: null,
      unresolved: null,
      excluded: null,
      evidence: 'original export lacks trajectory/contact identities',
    },
    {
      stage: 'receiver_surface_contact',
      eligible: 309,
      attempted: null,
      completed: null,
      interrupted: null,
      failed: null,
      unresolved: null,
      excluded: null,
      evidence: 'aggregate reception counters cannot be joined to all original pass identities',
    },
    {
      stage: 'team_control_result',
      eligible: 309,
      attempted: 309,
      completed: 178,
      interrupted: 0,
      failed: 131,
      unresolved: 0,
      excluded: 0,
      evidence: 'raw passOutcomes finalResult semantics',
    },
    {
      stage: 'canonical_completion_credit',
      eligible: 309,
      attempted: 309,
      completed: 143,
      interrupted: 0,
      failed: 131,
      unresolved: 0,
      excluded: 35,
      evidence:
        'requires actual contact, resolution, available participants, and actual receiver different from passer; original export cannot isolate which exclusion applies to each of the 35',
    },
    {
      stage: 'subsequent_team_retention',
      eligible: 143,
      attempted: null,
      completed: null,
      interrupted: null,
      failed: null,
      unresolved: null,
      excluded: null,
      evidence:
        'not equivalent to a completed pass; original spell ledger lacks each reception time',
    },
  ],
  possession: {
    changes: flow.possessionChanges,
    causes: flow.turnoverCauses,
    microSpells: flow.microSpellsUnder0_5s,
    adjacentReversals: flow.adjacentTickPossessionFlips,
  },
  agency: {
    ...d.playerAgency,
    presentationPolicyIds: [...new Set(d.presentationDecisions.map((p) => p.policyId))],
    controlled: d.decisionTelemetry,
  },
  conditioning: {
    reportedMinuteEight: {
      reserve: 0.75,
      burst: 0.02,
      source: 'owner observation; no minute-eight fitness checkpoint in original export',
    },
    final: d.canonicalPhysicalCheckpoint.players.find((p) => p.id === d.controlledPlayer).fitness,
  },
  rows: rows.map((p) => ({
    passId: p.passId,
    passerId: p.passerId,
    intendedReceiverId: p.receiverId,
    physicalContactProven: p.passId.includes(':pending-strike:'),
    released: stats.observedPassAttemptIds.includes(p.passId),
    rawResult: p.outcome,
    actualReceiverId: null,
    completionCredit: null,
    expectedReceivingOpportunity: p.selection?.expectedCompletion ?? null,
  })),
};
writeFileSync(`${root}/user-session-audit.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log('PR217 original audit', {
  attempts: receipt.canonicalAttempts,
  canonical: receipt.canonicalCompletions,
  ledger: receipt.ledgerResults,
  pendingContacts: receipt.identityReconciliation.releasedPendingPassIds.length,
});
