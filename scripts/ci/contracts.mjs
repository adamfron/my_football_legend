import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, json, validateManifest, checkEvidence } from './manifest.mjs';
import { runChild } from './runGroup.mjs';
import { qualityKeys, qualityProgram } from './quality.mjs';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers';
import fs from 'node:fs';
import { publishNodeResource } from './resourceProbe.mjs';
import { readNodeResources } from './telemetry.mjs';
import { pr209Context } from './replayPr209Check.mjs';
import { BASE as PR209_MERGED } from '../pr210SourceGuard.mjs';
import { execFileSync } from 'node:child_process';
const manifest = json('docs/performance/pr202/task-manifest.json');

test('PR209 history uses private real evidence files and still rejects byte drift', () => {
  const context = pr209Context();
  const evidence = 'docs/performance/pr195/pilot-protocol.json';
  const original = fs.readFileSync(evidence);
  const historicalBase = '5353858065eaefdebfabacdd12a1a961bda36d74';
  const git = (args) =>
    spawnSync('git', args, {
      cwd: context.cwd,
      env: context.env,
      windowsHide: true,
      encoding: 'utf8',
    });
  try {
    assert.equal(fs.lstatSync(join(context.cwd, 'docs')).isSymbolicLink(), false);
    assert.equal(fs.lstatSync(join(context.cwd, 'docs/performance')).isSymbolicLink(), false);
    for (let pr = 195; pr <= 209; pr++)
      assert.equal(
        fs.lstatSync(join(context.cwd, `docs/performance/pr${pr}`)).isSymbolicLink(),
        false,
      );
    const archived = execFileSync('git', ['show', `${PR209_MERGED}:${evidence}`], {
      windowsHide: true,
    });
    assert.deepEqual(fs.readFileSync(join(context.cwd, evidence)), archived);
    const diff = [
      'diff',
      '--exit-code',
      historicalBase,
      '--',
      ...Array.from({ length: 14 }, (_, i) => `docs/performance/pr${195 + i}`),
    ];
    assert.equal(git(diff).status, 0, 'Original evidence must be visible to Git on every platform');
    fs.appendFileSync(join(context.cwd, evidence), '\nintentional private corruption\n');
    assert.equal(git(diff).status, 1, 'Evidence drift must still fail the original Git assertion');
    assert.deepEqual(
      fs.readFileSync(evidence),
      original,
      'Private corruption leaked into checkout',
    );
    assert.equal(git(['diff', '--exit-code', '--cached', PR209_MERGED]).status, 0);
  } finally {
    context.cleanup();
  }
  assert.equal(fs.existsSync(context.cwd), false);
  assert.deepEqual(fs.readFileSync(evidence), original);
});
test('interrupted observer publication remains explicit; completed corruption still fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pr202-atomic-probe-'));
  const realWrite = fs.writeFileSync;
  try {
    const interruptedIO = {
      writeFileSync: (path) => {
        realWrite(path, '');
        throw Error('intentional interrupted publication');
      },
      renameSync: () => {
        throw Error('Incomplete record must never be published');
      },
    };
    assert.throws(
      () => publishNodeResource(dir, 'interrupted', {}, interruptedIO),
      /interrupted publication/,
    );
    assert.equal(fs.existsSync(join(dir, 'interrupted.json')), false);
    assert.deepEqual(readNodeResources(dir), { samples: [], incomplete: ['interrupted.json.tmp'] });
    const r = {
      pid: 1,
      parentPid: 0,
      argv: ['node', 'fixture'],
      node: process.version,
      platform: process.platform,
      exitCode: 0,
      wallSeconds: 1,
      cpuUserMicros: 1,
      cpuSystemMicros: 1,
      peakRSSKiB: 1,
    };
    publishNodeResource(dir, 'complete', r);
    assert.deepEqual(readNodeResources(dir).samples, [r]);
    realWrite(join(dir, 'corrupt.json'), '{');
    assert.throws(() => readNodeResources(dir), SyntaxError);
  } finally {
    rmSync(dir, { recursive: true });
  }
});
test('packing loses, duplicates or crosses no platform/budget case', () => {
  validateManifest(manifest);
  for (const mutate of [
    (m) => m.proposed[0].tasks.pop(),
    (m) => m.proposed[0].tasks.push(m.proposed[0].tasks[0]),
    (m) => (m.tasks[0].os = 'other-platform'),
    (m) => (m.proposed[0].measuredPayloadSeconds = 2701),
    (m) => m.gate.proposedNeeds.pop(),
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
  const controller = new globalThis.AbortController();
  const pending = runChild([process.execPath, '-e', 'setInterval(()=>{},100)'], {
    stdio: 'ignore',
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 100);
  const cancelled = await pending;
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.success, false);
});
test('actual rendered quality program rejects failure, timeout, cancelled, skipped and missing results', () => {
  const env = Object.fromEntries(qualityKeys.map((k) => [k, 'success']));
  const status = (e) => spawnSync(process.execPath, ['-e', qualityProgram], { env: e }).status;
  assert.equal(status(env), 0);
  for (const key of qualityKeys)
    for (const state of ['failure', 'cancelled', 'skipped', 'timed_out', '', undefined]) {
      const bad = { ...env, [key]: state };
      if (state === undefined) delete bad[key];
      assert.equal(status(bad), 1);
    }
  assert.equal(status({}), 1);
});
