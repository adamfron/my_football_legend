import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Buffer } from 'node:buffer';
import console from 'node:console';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const archivePath = 'docs/performance/pr175-evidence/PR175-raw-and-harnesses.json.gz';
const archiveBytes = readFileSync(archivePath);
const archive = z
  .object({ encoding: z.string(), files: z.record(z.string(), z.string()) })
  .parse(JSON.parse(gunzipSync(archiveBytes)));
const index = JSON.parse(readFileSync('docs/performance/PR175-evidence-index.json', 'utf8'));
if (hash(archiveBytes) !== index.archive.sha256)
  throw new Error('Historical archive hash mismatch');
mkdirSync('../pr176-inputs', { recursive: true });
const retained = [];
for (const name of [
  'pr175-natural/frozen-states.json.gz',
  'pr175-natural-dev-strength/frozen-states.json.gz',
]) {
  const bytes = Buffer.from(archive.files[name], 'base64');
  const expected = index.files.find((f) => f.name === name);
  if (hash(bytes) !== expected.sha256) throw new Error(`Frozen bytes mismatch: ${name}`);
  const output = `../pr176-inputs/${name.split('/')[0]}.json.gz`;
  writeFileSync(output, bytes);
  retained.push({ name, sha256: hash(bytes), bytes: bytes.length, output });
}
writeFileSync(
  '../pr176-inputs/manifest.json',
  JSON.stringify({ archivePath, sha256: hash(archiveBytes), retained }, null, 2) + '\n',
);
console.log(JSON.stringify({ restored: retained }));
