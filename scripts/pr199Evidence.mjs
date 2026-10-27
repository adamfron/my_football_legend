import process from 'node:process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname } from 'node:path';
import { hash, read, files } from './pr196Evidence.mjs';
import { git } from './pr197Evidence.mjs';
export { hash, read, files, git };
export const BASE = 'aa2292b664ab3c0afa43297c2e4d24fc0f6c6d5b';
export const ROOT = 'docs/performance/pr199';
export const options = new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
export const normalized = (path) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
export const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  const data = JSON.stringify(value, null, path.endsWith('.gz') ? 0 : 2) + '\n';
  writeFileSync(path, path.endsWith('.gz') ? gzipSync(data, { level: 9 }) : data, { flag: 'wx' });
};
export const source = () =>
  Object.fromEntries(
    [
      ...files('src/core'),
      ...files('src/schemas'),
      ...files('src/types'),
      ...files('scripts'),
      'package.json',
      'package-lock.json',
    ]
      .filter((p) => !/\.test\./.test(p))
      .sort()
      .map((p) => [p, hash(normalized(p))]),
  );
export const identity = () => {
  const manifest = source(),
    fingerprint = hash(manifest),
    path = `${ROOT}/source/${fingerprint}.json.gz`;
  if (!options.has('check') && !existsSync(path)) {
    const baseline = read(`${ROOT}/frozen-pr198.json`).source;
    write(path, {
      base: BASE,
      manifest,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => manifest[p] !== baseline[p])
          .map((p) => [p, normalized(p)]),
      ),
    });
  }
  return { base: BASE, fingerprint, path };
};
export const finish = (name, result, costs = {}) => {
  const path = `${ROOT}/${name}`;
  if (options.has('check')) {
    const saved = read(path).result;
    const { source: oldSource, ...oldResult } = saved;
    const { source: newSource, ...newResult } = result;
    void newSource;
    if (hash(oldResult) !== hash(newResult)) throw Error('PR199 deterministic drift: ' + name);
    if (hash(read(oldSource.path).manifest) !== oldSource.fingerprint)
      throw Error('PR199 source drift');
  } else write(path, { result, costs });
};
