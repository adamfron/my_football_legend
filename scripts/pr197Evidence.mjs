import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync, linkSync, unlinkSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { hash, read, receipt, files } from './pr196Evidence.mjs';
export { hash, read, receipt };
export const BASE = '81e0457a0fc344cdedaa18d035121cb7fe51bcc2';
export const git = (args, extra = {}) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 128 * 1024 * 1024,
    ...extra,
  });
export const source = () => {
  const paths = [
    ...files('src/core'),
    ...files('src/schemas'),
    ...files('src/types'),
    ...files('scripts'),
    'package-lock.json',
  ]
    .filter((p) => !/\.test\./.test(p))
    .sort();
  return Object.fromEntries(
    paths.map((p) => [p, hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))]),
  );
};
export const sourceIdentity = () => {
  const manifest = source(),
    fingerprint = hash(manifest),
    path = `docs/performance/pr197/source/${fingerprint}.json.gz`;
  if (!process.argv.includes('--check') && !existsSync(path)) {
    const baseline = read('docs/performance/pr197/frozen-pr196.json').source;
    const archive = {
      base: BASE,
      manifest,
      contents: Object.fromEntries(
        Object.keys(manifest)
          .filter((p) => manifest[p] !== baseline[p])
          .map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
      ),
    };
    mkdirSync('docs/performance/pr197/source', { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, gzipSync(JSON.stringify(archive) + '\n'), { flag: 'wx' });
    try {
      linkSync(temporary, path);
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    } finally {
      unlinkSync(temporary);
    }
    if (hash(read(path).manifest) !== fingerprint) throw Error('Concurrent source collision');
  }
  return { base: BASE, fingerprint, path };
};
export const argumentsMap = () =>
  new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
export const finish = (path, deterministic, costs, check = false) => {
  if (check) {
    const saved = read(path);
    const { source: recordedSource, ...recorded } = saved.result;
    const { source: currentSource, ...current } = deterministic;
    void currentSource;
    if (
      recordedSource?.path &&
      hash(read(recordedSource.path).manifest) !== recordedSource.fingerprint
    )
      throw Error('Recorded source manifest drift');
    if (hash(recorded) !== hash(current)) throw Error('Deterministic evidence drift: ' + path);
  } else receipt(path, { result: deterministic, costs });
};
