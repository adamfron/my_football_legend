import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import console from 'node:console';
import { readPr192Evidence } from './readPr192Evidence.mjs';
const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : JSON.stringify(v))
    .digest('hex');
const corrections = [];
for (const design of ['ss', 'sw']) {
  const path = `docs/performance/pr192/matches/${design}-state-value-v1-combined.json`,
    r = readPr192Evidence(path);
  if (r.captureReferenceCorrection) continue;
  const original = JSON.parse(JSON.stringify(r)),
    oldPath = r.capture.path;
  const source = oldPath.replace('.json.gz', '-rejected-overlap.json.gz');
  if (sha(JSON.parse(gunzipSync(readFileSync(source)))) !== r.capture.sha256)
    throw Error('Retained combined capture hash drift');
  const correct = `docs/performance/pr192/matches/capture-${design}-combined-restored.json.gz`;
  if (
    existsSync(correct) &&
    sha(JSON.parse(gunzipSync(readFileSync(correct)))) !== r.capture.sha256
  )
    throw Error('Refusing capture overwrite');
  if (!existsSync(correct)) copyFileSync(source, correct);
  r.capture.path = correct;
  r.captureReferenceCorrection = {
    oldPath,
    originalReceiptHash: sha(original),
    method:
      'Exact retained combined bytes, matched against original full-match capture hash; A bytes independently restored from its exact input prefix.',
  };
  corrections.push({ path, original });
  writeFileSync(path, JSON.stringify(r, null, 2) + '\n');
}
const output = 'docs/performance/pr192/rejected-capture-references.json';
if (corrections.length) {
  if (existsSync(output)) throw Error('Refusing correction history overwrite');
  writeFileSync(
    output,
    JSON.stringify({ schema: 'mfl-pr192-capture-reference-correction-v1', corrections }, null, 2) +
      '\n',
  );
}
console.log({ corrected: corrections.length });
