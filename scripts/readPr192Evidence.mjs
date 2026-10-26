import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Lossless packaging only. Reconstructs the exact original JSON bytes and checks
 * both the retained compressed bytes and the original uncompressed checksum. */
export const readPr192Evidence = (path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema !== 'mfl-pr192-packed-json-v1') return value;
  const archive = value.receiptArchive,
    absolute = resolve(archive.path),
    root = resolve('docs/performance/pr192');
  if (!absolute.startsWith(root + sep)) throw Error('Evidence archive outside PR192 directory');
  const compressed = readFileSync(absolute),
    raw = gunzipSync(compressed);
  if (sha(compressed) !== archive.sha256 || sha(raw) !== archive.uncompressedSha256)
    throw Error('Packed evidence checksum drift ' + path);
  return JSON.parse(raw.toString('utf8'));
};
