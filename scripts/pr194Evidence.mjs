import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
export {
  hash,
  manifest,
  canonicalKernelManifest,
  files,
  POLICIES,
  readDevelopmentInput,
  writeReceipt,
} from './pr193Evidence.mjs';
import { hash } from './pr193Evidence.mjs';
export const PR193_BASE = 'bc7c71b2e8daf910ed5a4ded5d731f5aa668cc4d';
export const retainPr194Source = (source) => {
  const baseline = new Map(
    JSON.parse(readFileSync('docs/performance/pr194/frozen-pr193.json')).source.map((p) => [
      p.path,
      p.sha256,
    ]),
  );
  const overrides = source
    .filter((p) => baseline.get(p.path) !== p.sha256)
    .map((p) => ({ ...p, content: readFileSync(p.path, 'utf8').replaceAll('\r\n', '\n') }));
  const raw = JSON.stringify({ base: PR193_BASE, source, overrides }),
    bytes = gzipSync(raw),
    path = `docs/performance/pr194/source/${hash(source)}.json.gz`;
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (hash(gunzipSync(readFileSync(path))) !== hash(raw)) throw Error('Source archive collision');
  } else writeFileSync(path, bytes, { flag: 'wx' });
  return { path, sha256: hash(readFileSync(path)), originalSha256: hash(raw) };
};
