import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import console from 'node:console';
const root = 'docs/performance/pr192',
  sha = (v) => createHash('sha256').update(v).digest('hex');
const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(dir + '/' + d.name) : [dir + '/' + d.name],
  );
let before = 0,
  after = 0,
  count = 0;
for (const path of files(root).filter(
  (p) => p.endsWith('.json') && !p.endsWith('/evidence-index.json'),
)) {
  const raw = readFileSync(path),
    value = JSON.parse(raw);
  if (raw.length < 50000 || value.schema === 'mfl-pr192-packed-json-v1') continue;
  const archive = path + '.gz';
  if (existsSync(archive)) {
    if (!gunzipSync(readFileSync(archive)).equals(raw))
      throw Error('Refusing archive overwrite ' + archive);
  } else writeFileSync(archive, gzipSync(raw));
  const compressed = readFileSync(archive),
    header = {
      schema: 'mfl-pr192-packed-json-v1',
      originalSchema: value.schema ?? null,
      receiptArchive: { path: archive, sha256: sha(compressed), uncompressedSha256: sha(raw) },
    };
  for (const key of [
    'design',
    'policy',
    'mode',
    'sourceHash',
    'runnerHash',
    'inputHash',
    'seed',
    'status',
    'failure',
    'finalHash',
    'seconds',
    'capture',
    'captureReferenceCorrection',
    'experiments',
    'selectedId',
    'numericMatchToRoundedHumanEvidence',
  ])
    if (value[key] !== undefined) header[key] = value[key];
  const pointer = JSON.stringify(header, null, 2) + '\n';
  writeFileSync(path, pointer);
  before += raw.length;
  after += compressed.length + Buffer.byteLength(pointer);
  count++;
}
console.log({ packed: count, originalBytes: before, retainedBytes: after, lossless: true });
