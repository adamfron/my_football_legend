import { z } from 'zod';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const evidence = z.object({
  path: z.string(),
  sha256: sha,
  resultSha256: sha.nullable(),
  finalHash: z.string().nullable(),
  source: z
    .object({ path: z.string(), archiveSha256: sha, fingerprint: sha, base: z.string() })
    .nullable(),
});
const task = z.object({
  id: z.string(),
  command: z.array(z.string()).min(1),
  originalJob: z.string(),
  os: z.string(),
  node: z.string(),
  timeoutMinutes: z.union([z.literal(30), z.literal(45)]),
  requiredResult: z.literal('success'),
  cases: z.array(z.object({ id: z.string(), receipt: evidence })),
});
export const manifestSchema = z.object({
  schema: z.literal('pr202-ci-manifest-v1'),
  base: z.string(),
  originalWorkflowSha256: sha,
  packageScriptsSha256: sha,
  gate: z.object({
    name: z.literal('quality'),
    timeoutMinutes: z.literal(30),
    os: z.literal('ubuntu-latest'),
    originalNeeds: z.array(z.string()).min(1),
    proposedNeeds: z.array(z.string()).min(1),
    requireEveryResult: z.literal('success'),
    originalCommand: z.string(),
    proposedProgram: z.string(),
    rejectedResults: z.array(z.string()),
  }),
  tasks: z.array(task),
  original: z.array(z.object({ id: z.string(), tasks: z.array(z.string()) })),
  proposed: z.array(
    z.object({
      id: z.string(),
      tasks: z.array(z.string()),
      measuredPayloadSeconds: z.number().nonnegative(),
    }),
  ),
});
export const equivalenceSchema = z.object({
  schema: z.literal('pr202-ci-equivalence-v1'),
  base: z.string(),
  originalTaskDefinitionsSha256: sha,
  proposedTaskDefinitionsSha256: sha,
  frozenInventorySha256: sha,
  originalCommands: z.number().int().positive(),
  explicitCases: z.number().int().positive(),
  fullMatchExecutions: z.literal(63),
  beforeJobs: z.literal(43),
  afterJobs: z.literal(28),
  taskMultiplicityEqual: z.literal(true),
  platformsAndEditionsEqual: z.literal(true),
  receiptAndArchiveBytesEqual: z.literal(true),
  originalTimeoutsEqual: z.literal(true),
  currentRuntimeAndHistoricalEvidenceUnchanged: z.literal(true),
  historicalCheckerContext: z.literal('merged-pr201-private-index-and-work-tree'),
});
export const nodeResourceSchema = z.object({
  pid: z.number().int().positive(),
  parentPid: z.number().int().nonnegative(),
  argv: z.array(z.string()),
  node: z.string(),
  platform: z.string(),
  exitCode: z.number().int(),
  wallSeconds: z.number().nonnegative(),
  cpuUserMicros: z.number().nonnegative(),
  cpuSystemMicros: z.number().nonnegative(),
  peakRSSKiB: z.number().nonnegative(),
});
export const groupExecutionSchema = z.object({
  schema: z.literal('pr202-group-execution-v1'),
  layout: z.enum(['original', 'proposed']),
  group: z.string(),
  head: z.string(),
  actionsHead: z.string().nullable(),
  runId: z.string().nullable(),
  runAttempt: z.string().nullable(),
  node: z.string(),
  platform: z.string(),
  platformParity: z.boolean(),
  runnerOS: z.string().nullable(),
  host: z
    .object({
      arch: z.string(),
      release: z.string(),
      cpuModel: z.string().nullable(),
      cpuCount: z.number().int().nonnegative(),
      totalMemoryBytes: z.number().nonnegative(),
    })
    .optional(),
  manifestSha256: sha,
  startedAt: z.string(),
  completedAt: z.string().optional(),
  wallSeconds: z.number().nonnegative().optional(),
  status: z.enum(['running', 'success', 'failure']),
  tasks: z.array(
    z.object({
      id: z.string(),
      command: z.array(z.string()),
      status: z.enum(['running', 'success', 'failure']),
      startedAt: z.string(),
      completedAt: z.string().optional(),
      exitCode: z.number().int().nullable().optional(),
      signal: z.string().nullable().optional(),
      timedOut: z.boolean().optional(),
      cancelled: z.boolean().optional(),
      success: z.boolean().optional(),
      error: z.string().optional(),
      wallSeconds: z.number().nonnegative().optional(),
      nodeProcesses: z.number().int().nonnegative().optional(),
      incompleteNodeProcessSamples: z.array(z.string()).optional(),
      maxNodeProcessRSSKiB: z.number().nonnegative().nullable().optional(),
      sumNodeCPUMicros: z.number().nonnegative().nullable().optional(),
    }),
  ),
});
export function validateManifest(input) {
  const m = manifestSchema.parse(input);
  const ids = m.tasks.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'Duplicate task');
  const old = m.original.flatMap((g) => g.tasks),
    next = m.proposed.flatMap((g) => g.tasks);
  assert.equal(new Set(old).size, old.length, 'Duplicate original task');
  assert.equal(new Set(next).size, next.length, 'Duplicate proposed task');
  assert.deepEqual([...old].sort(), [...ids].sort(), 'Original coverage mismatch');
  assert.deepEqual([...next].sort(), [...ids].sort(), 'Proposed coverage mismatch');
  assert.equal(m.original.length + 1, 43, 'Original execution jobs plus quality');
  const families = (groups) =>
    [
      ...new Set(
        groups.map((g) => (g.id.startsWith('source-') ? 'historical-source' : g.id.split(':')[0])),
      ),
    ].sort();
  assert.deepEqual(
    [...m.gate.originalNeeds].sort(),
    families(m.original),
    'Original gate omits a family',
  );
  assert.deepEqual(
    [...m.gate.proposedNeeds].sort(),
    families(m.proposed),
    'Proposed gate omits a family',
  );
  for (const group of m.proposed) {
    const tasks = group.tasks.map((id) => m.tasks.find((t) => t.id === id));
    assert.equal(
      new Set(tasks.map((t) => `${t.os}/${t.node}/${t.timeoutMinutes}`)).size,
      1,
      'Platform/budget mixing',
    );
    assert.ok(
      group.measuredPayloadSeconds < tasks[0].timeoutMinutes * 60,
      'Payload exceeds budget',
    );
  }
  const cases = m.tasks.flatMap((t) => t.cases.map((c) => `${t.os}/${t.node}/${c.id}`));
  assert.equal(new Set(cases).size, cases.length, 'Duplicate platform case');
  return m;
}
export function checkEvidence(receipt) {
  assert.equal(
    digest(readFileSync(receipt.path)),
    receipt.sha256,
    `Receipt bytes drift: ${receipt.path}`,
  );
  if (receipt.source)
    assert.equal(
      digest(readFileSync(receipt.source.path)),
      receipt.source.archiveSha256,
      'Archive bytes drift',
    );
}
