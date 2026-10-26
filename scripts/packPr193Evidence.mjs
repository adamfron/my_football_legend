import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import console from 'node:console';
import { files, hash } from './pr193Evidence.mjs';
import { readPr193Evidence } from './readPr193Evidence.mjs';
let saved = 0;
for (const path of files('docs/performance/pr193/matches').filter((p) => p.endsWith('.json'))) {
  const raw = readFileSync(path),
    value = JSON.parse(raw);
  if (value.schema === 'mfl-pr193-packed-json-v1') {
    readPr193Evidence(path);
    continue;
  }
  const archive = path + '.gz',
    bytes = gzipSync(raw, { level: 9 });
  if (hash(gunzipSync(bytes)) !== hash(raw)) throw Error('Packaging changed original bytes');
  if (existsSync(archive)) throw Error('Archive already exists ' + archive);
  writeFileSync(archive, bytes, { flag: 'wx' });
  const pointer = {
    schema: 'mfl-pr193-packed-json-v1',
    receiptArchive: {
      path: archive,
      sha256: hash(bytes),
      originalSha256: hash(raw),
      originalBytes: raw.length,
    },
  };
  writeFileSync(path, JSON.stringify(pointer, null, 2) + '\n');
  if (hash(readPr193Evidence(path)) !== hash(value))
    throw Error('Packaging round trip changed result');
  saved += raw.length - bytes.length;
}
console.log('PR193 lossless packaging saved', saved, 'bytes; exact original bytes retained');
