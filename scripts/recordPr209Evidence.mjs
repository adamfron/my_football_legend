import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { hash, files } from './pr199Evidence.mjs';
import { checkPr209Source } from './pr209SourceGuard.mjs';
const root = 'docs/performance/pr209';
const input = process.argv.find((a) => a.startsWith('--verification='))?.slice(15);
if (input) {
  const supplied = JSON.parse(readFileSync(input, 'utf8'));
  assert.equal(supplied.source, checkPr209Source().fingerprint);
  const commands = supplied.commands.map((c) => ({ ...c, sha256: hash(readFileSync(c.log)) }));
  assert.equal(commands.find((c) => c.key === 'verify').exitCode, 0);
  writeFileSync(
    `${root}/verification.json`,
    JSON.stringify({ ...supplied, commands }, null, 2) + '\n',
    { flag: 'wx' },
  );
}
const inventory = files(root)
  .filter((p) => p !== `${root}/evidence-index.json`)
  .sort()
  .map((path) => ({ path, sha256: hash(readFileSync(path)) }));
writeFileSync(
  `${root}/evidence-index.json`,
  JSON.stringify({ schema: 'pr209-evidence-index-v1', files: inventory }, null, 2) + '\n',
);
console.log('PR209 exact evidence index: ' + inventory.length + ' files');
