import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve, sep } from 'node:path';
import { hash } from './pr194Evidence.mjs';
export const readPr194Evidence = (path) => {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value.schema !== 'mfl-pr194-packed-json-v1') return value;
  const a = value.receiptArchive,
    target = resolve(a.path);
  if (!target.startsWith(resolve('docs/performance/pr194') + sep))
    throw Error('Archive outside PR194');
  const bytes = readFileSync(target),
    raw = gunzipSync(bytes);
  if (hash(bytes) !== a.sha256 || hash(raw) !== a.originalSha256)
    throw Error('Packed evidence drift ' + path);
  return JSON.parse(raw);
};
