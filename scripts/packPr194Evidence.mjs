import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import console from 'node:console';
import { files, hash } from './pr194Evidence.mjs';
for (const path of files('docs/performance/pr194/matches').filter((p) => p.endsWith('.json'))) {
  const raw = readFileSync(path),
    receipt = JSON.parse(raw);
  if (receipt.schema === 'mfl-pr194-packed-json-v1') continue;
  const archive = path + '.gz',
    bytes = gzipSync(raw);
  writeFileSync(archive, bytes, { flag: 'wx' });
  writeFileSync(
    path,
    JSON.stringify(
      {
        schema: 'mfl-pr194-packed-json-v1',
        receiptArchive: {
          path: archive,
          sha256: hash(bytes),
          originalSha256: hash(raw),
          originalBytes: raw.length,
        },
      },
      null,
      2,
    ) + '\n',
  );
  console.log(path, raw.length, '->', bytes.length);
}
