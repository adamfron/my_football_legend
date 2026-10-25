import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
const base = '251ec9f88f212f7a93d26ebc7491b1176e5a25ef',
  output = 'docs/performance/pr191/baseline.json';
if (existsSync(output)) throw Error('Frozen baseline exists');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const historical = JSON.parse(readFileSync('docs/performance/pr190/evidence-index.json'));
const immutable = (path) =>
  execFileSync('git', ['show', `${base}:${path}`], {
    encoding: 'utf8',
    windowsHide: true,
  }).replaceAll('\r\n', '\n');
const physics = historical.source.find((e) => e.path === 'src/core/matchSimulation/ballPhysics.ts');
if (sha(immutable(physics.path)) !== physics.sha256) throw Error('Baseline ball physics mismatch');
const rows = [];
for (const design of ['ww', 'ss', 'sw'])
  for (const policy of [
    'state-value-v1',
    'phase-role-hybrid-v1',
    'opportunity-driven-v1',
    'hierarchical-intent-v1',
    'contextual-judgment-v1',
  ]) {
    const path = `docs/performance/pr190/${design}-${policy}-spin-final.json`,
      raw = immutable(path),
      receipt = JSON.parse(raw);
    const original = JSON.parse(
      readFileSync(
        `docs/performance/PR188-match-dev-${design}-${policy}-full-observed-final-v1.json`,
      ),
    );
    const initial = JSON.parse(gunzipSync(readFileSync(original.archive))).input;
    rows.push({
      path,
      sha256: sha(raw),
      seed: initial.seed,
      inputHash: receipt.inputSha256,
      finalHash: receipt.finalStateSha256,
      passes: receipt.passes,
      shots: receipt.shots,
      status: receipt.status,
    });
  }
writeFileSync(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      commit: base,
      pr190Head: 'a8cc1b040451399f28edf6fd55ef0a262a0b371f',
      sourceHash: historical.sourceSha256,
      stepSeconds: 0.025,
      physics,
      rows,
      retained: [
        'docs/performance/pr189/evidence-index.json',
        'docs/performance/pr190/evidence-index.json',
      ],
      independentCohort: 'unopened',
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    baseline: base,
    retainedMatches: rows.length,
    sourceHash: historical.sourceSha256,
  }),
);
