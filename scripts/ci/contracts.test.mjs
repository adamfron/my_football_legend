import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, json, validateManifest, checkEvidence } from './manifest.mjs';
import { runChild, successful } from './runGroup.mjs';
const manifest = json('docs/performance/pr202/task-manifest.json');
test('packing loses, duplicates or crosses no platform/budget case', () => {
  validateManifest(manifest);
  for (const mutate of [
    (m) => m.proposed[0].tasks.pop(),
    (m) => m.proposed[0].tasks.push(m.proposed[0].tasks[0]),
    (m) => (m.tasks[0].os = 'other-platform'),
    (m) => (m.proposed[0].measuredPayloadSeconds = 2701),
  ]) {
    const m = globalThis.structuredClone(manifest);
    mutate(m);
    assert.throws(() => validateManifest(m));
  }
});
test('corrupt receipt bytes and original archive bytes fail independently', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr202-corruption-'));
  try {
    const path = join(dir, 'receipt'),
      source = join(dir, 'archive');
    writeFileSync(path, 'receipt');
    writeFileSync(source, 'archive');
    const r = {
      path,
      sha256: digest('receipt'),
      source: { path: source, archiveSha256: digest('archive') },
    };
    checkEvidence(r);
    writeFileSync(path, 'corrupt');
    assert.throws(() => checkEvidence(r), /Receipt bytes drift/);
    writeFileSync(path, 'receipt');
    writeFileSync(source, 'corrupt');
    assert.throws(() => checkEvidence(r), /Archive bytes drift/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test('nonzero exit, crash, missing executable and killed child fail closed', async () => {
  for (const code of ['process.exit(7)', 'throw Error("intentional child crash")']) {
    const r = await runChild([process.execPath, '-e', code]);
    assert.equal(r.success, false);
  }
  assert.equal((await runChild(['mfl-pr202-executable-does-not-exist'])).success, false);
  const timeout = await runChild([process.execPath, '-e', 'setInterval(()=>{},100)'], {
    timeoutMs: 500,
  });
  assert.equal(timeout.timedOut, true);
  assert.equal(timeout.success, false);
});
test('stable quality gate rejects failure, timeout, cancelled, skipped and missing results', () => {
  assert.equal(successful(['success', 'success']), true);
  for (const state of ['failure', 'cancelled', 'skipped', 'timed_out', '', undefined])
    assert.equal(successful(['success', state]), false);
  assert.equal(successful([]), false);
});
