import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, sep, basename } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { source, hash } from './pr199Evidence.mjs';

const path = process.argv[2];
assert.ok(path, 'Provide a decision corpus receipt path');
const saved = JSON.parse(readFileSync(path, 'utf8'));
assert.equal(hash(saved.source.manifest), saved.source.fingerprint);
assert.deepEqual(source(), saved.source.manifest, 'Receipt source differs from current source');
assert.equal(saved.rows.length, 48);
for (const sample of [0, 1, 2, 3, 4, 5])
  for (const arm of ['open', 'pressure', 'unseen', 'facing_support'])
    for (const profile of ['prospective-play-v1', 'two-pass-continuity-dev-v1'])
      assert.equal(
        saved.rows.filter((r) => r.sample === sample && r.arm === arm && r.profile === profile)
          .length,
        1,
        `Missing or duplicate matched trial ${sample}/${arm}/${profile}`,
      );
const cId = 'geometry:anchor:9';
for (const row of saved.rows) {
  assert.ok(row.decisions.length, `No actual B decision ${row.sample}/${row.arm}`);
  for (const d of row.decisions) {
    assert.ok(d.scene && d.candidates, 'Missing exact decision scene or menu');
    const known = [...d.scene.visible, ...(d.scene.remembered ?? [])].some((p) => p.id === cId);
    const inKnowledge = (d.scene.knowledge ?? []).some((p) => p.id === cId);
    const candidate = d.candidates.some(
      (p) => p.action.type === 'pass' && p.action.receiverId === cId,
    );
    if (!known && !inKnowledge) {
      assert.equal(candidate, false, 'Unknown receiver must not appear in menu');
      assert.notEqual(d.action?.receiverId, cId, 'Unknown receiver must not be selected');
    }
  }
  if (row.arm === 'unseen') {
    const absent = row.decisions.find(
      (d) =>
        !d.scene.visible.some((p) => p.id === cId) &&
        !(d.scene.remembered ?? []).some((p) => p.id === cId) &&
        !(d.scene.knowledge ?? []).some((p) => p.id === cId),
    );
    assert.ok(absent, `Unseen case did not qualify: ${row.sample}`);
    assert.ok(
      row.decisions.some(
        (d) =>
          d.at > absent.at &&
          (d.scene.knowledge ?? []).some((p) => p.id === cId) &&
          d.candidates.some((p) => p.action.type === 'pass' && p.action.receiverId === cId),
      ),
      `No later positive reacquisition control: ${row.sample}`,
    );
  }
  if (row.arm === 'open' || row.arm === 'pressure') {
    assert.ok(
      row.decisions.some(
        (d) =>
          d.candidates.some((p) => p.action.type === 'carry') &&
          d.candidates.some((p) => p.action.type === 'hold') &&
          d.candidates.some(
            (p) => p.action.type === 'pass' && p.action.receiverId === row.alternativeId,
          ),
      ),
      `Alternatives missing: ${row.sample}/${row.arm}`,
    );
  }
}
if (process.argv.includes('--replay')) {
  mkdirSync('.benchmark-artifacts', { recursive: true });
  const dir = mkdtempSync(resolve('.benchmark-artifacts/pr204-decisions-'));
  try {
    const output = join(dir, 'replay.json');
    execFileSync(
      process.execPath,
      [
        '--max-semi-space-size=64',
        '--experimental-transform-types',
        '--import',
        './scripts/registerTypescriptLoader.mjs',
        'scripts/benchmarkPr204Decisions.mjs',
        output,
      ],
      { stdio: 'inherit', windowsHide: true },
    );
    const actual = JSON.parse(readFileSync(output, 'utf8'));
    assert.deepEqual(actual.rows, saved.rows, 'Decision, release or physical outcome drift');
  } finally {
    assert.ok(
      dir.startsWith(resolve('.benchmark-artifacts') + sep) &&
        basename(dir).startsWith('pr204-decisions-'),
    );
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log(
  'PR204 decision evidence PASS: exact scenes, qualified unseen, reacquisition, alternatives',
);
