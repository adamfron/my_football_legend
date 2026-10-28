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
