import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, sep } from 'node:path';
import { hash } from './pr193Evidence.mjs';
/** Lossless packaging; both archived and exact original JSON bytes are checked. */
export const readPr193Evidence = (path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema !== 'mfl-pr193-packed-json-v1') return value;
  const archive = value.receiptArchive,
    target = resolve(archive.path);
  if (!target.startsWith(resolve('docs/performance/pr193') + sep))
    throw Error('Evidence archive outside PR193');
  const bytes = readFileSync(target),
    raw = gunzipSync(bytes);
  if (hash(bytes) !== archive.sha256 || hash(raw) !== archive.originalSha256)
    throw Error('Packed PR193 evidence drift ' + path);
  return JSON.parse(raw);
};
