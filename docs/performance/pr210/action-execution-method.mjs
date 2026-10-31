import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  createPr210Carry,
  createPr210Cases,
  tracePr210Carry,
} from '../../../scripts/pr210Scenarios.ts';
import { projectPlayerAgency } from '../../../src/core/matchSimulation/playerDecision.ts';
import { resolveMatchAction } from '../../../src/core/matchSimulation/matchActions.ts';
import { releaseContactReadiness } from '../../../src/core/matchSimulation/decisionReadiness.ts';
import { checkPr210Source } from '../../../scripts/pr210SourceGuard.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const binding = checkPr210Source();
const rows = [];
for (const [name, initial] of Object.entries({
  sprint: createPr210Carry(),
  ...createPr210Cases(),
})) {
  const { state } = tracePr210Carry(initial);
  const opportunity = projectPlayerAgency(state).opportunity;
  if (opportunity?.kind !== 'on_ball') continue;
  const actor = state.players.find((p) => p.id === opportunity.actorId);
  for (const option of opportunity.options) {
    if (option.kind !== 'action') continue;
    const cloned = JSON.parse(JSON.stringify(state));
    const next = resolveMatchAction(cloned, option.action, 'human_selected');
    rows.push({
      name,
      at: state.time,
      action: option.action,
      readiness: releaseContactReadiness(state, actor),
      canonicalTransition: next !== cloned,
      resultKind: ['hold', 'carry'].includes(option.action.type)
        ? 'committed_intention'
        : (next.ball.travelKind ?? 'no_release'),
      resultHash: digest(JSON.stringify(next)),
    });
  }
}
const schema = z.array(
  z.object({
    name: z.string(),
    at: z.number(),
    action: z.unknown(),
    readiness: z.object({ ready: z.boolean() }).passthrough(),
    canonicalTransition: z.boolean(),
    resultKind: z.string(),
    resultHash: z.string(),
  }),
);
schema.parse(rows);
assert.ok(rows.length > 0);
for (const row of rows) {
  assert.ok(row.readiness.ready);
  assert.ok(row.canonicalTransition, `${row.name}: ${JSON.stringify(row.action)}`);
  assert.notEqual(row.resultKind, 'no_release');
}
assert.equal(checkPr210Source().fingerprint, binding.fingerprint);
const receipt = {
  source: binding.fingerprint,
  methodSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  interpretation:
    'Canonical requests at available contacts; carry/hold are intentions, not fabricated executed touches.',
  rows,
  resultHash: digest(JSON.stringify(rows)),
};
const path = 'docs/performance/pr210/action-execution.json';
if (process.argv.includes('--check'))
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), receipt);
else writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
console.log(
  JSON.stringify({
    source: receipt.source,
    actions: rows.length,
    executableRequests: rows.filter((r) => r.canonicalTransition).length,
    resultHash: receipt.resultHash,
  }),
);
