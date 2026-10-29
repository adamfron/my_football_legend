import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pr201Context } from './replayPr201Check.mjs';
const context = pr201Context();
try {
  const original = JSON.parse(
    gunzipSync(readFileSync('docs/performance/pr201/information-boundary-final-v2.json.gz')),
  );
  const path = join(context.cwd, 'intentional-corrupt-receipt.json.gz');
  const args = [
    '--max-semi-space-size=64',
    '--experimental-transform-types',
    '--import',
    './scripts/registerTypescriptLoader.mjs',
    'scripts/benchmarkPr201Information.mjs',
    '--version=final-v2',
    `--check=${path}`,
  ];
  const run = () =>
    spawnSync(process.execPath, args, {
      cwd: context.cwd,
      env: context.env,
      encoding: 'utf8',
      windowsHide: true,
    });
  writeFileSync(path, gzipSync(JSON.stringify(original)));
  const good = run();
  assert.equal(good.status, 0, good.stderr);
  original.result.intentionalCorruption = true;
  writeFileSync(path, gzipSync(JSON.stringify(original)));
  const bad = run();
  assert.notEqual(bad.status, 0, 'Original physical harness accepted altered deterministic result');
  assert.match(bad.stderr, /AssertionError|deterministic|drift/i);
  console.log(
    'Original PR201 physical information harness: valid receipt PASS, intentional deterministic-result corruption REJECTED',
  );
} finally {
  context.cleanup();
}
