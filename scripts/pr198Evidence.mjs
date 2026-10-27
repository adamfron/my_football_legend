import process from 'node:process';
import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  linkSync,
  unlinkSync,
  copyFileSync,
  constants,
} from 'node:fs';
import { gzipSync } from 'node:zlib';
import { hash, read, receipt, files } from './pr196Evidence.mjs';
import { git } from './pr197Evidence.mjs';
export { hash, read, receipt, git };
export const BASE = 'fb8e38fce3087a0713a26cfafb5cde6f1e6c0097';
export const args = () =>
  new Map(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
export const source = () =>
  Object.fromEntries(
    [
      ...files('src/core'),
      ...files('src/schemas'),
      ...files('src/types'),
      ...files('scripts'),
      'package-lock.json',
    ]
      .filter((p) => !/\.test\./.test(p))
      .sort()
      .map((p) => [p, hash(readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))]),
  );
export const sourceIdentity = () => {
  const manifest = source(),
    fingerprint = hash(manifest);
  const path = `docs/performance/pr198/source/${fingerprint}.json.gz`;
  if (!process.argv.includes('--check') && !existsSync(path)) {
    const baseline = read('docs/performance/pr198/frozen-pr197.json').source;
    mkdirSync('docs/performance/pr198/source', { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      gzipSync(
        JSON.stringify({
          base: BASE,
          manifest,
          contents: Object.fromEntries(
            Object.keys(manifest)
              .filter((p) => manifest[p] !== baseline[p])
              .map((p) => [p, readFileSync(p, 'utf8').replaceAll('\r\n', '\n')]),
          ),
        }) + '\n',
      ),
      { flag: 'wx' },
    );
    try {
      linkSync(temporary, path);
    } catch (error) {
      if (error.code === 'EPERM') {
        try {
          copyFileSync(temporary, path, constants.COPYFILE_EXCL);
        } catch (copyError) {
          if (copyError.code !== 'EEXIST') throw copyError;
        }
      } else if (error.code !== 'EEXIST') throw error;
    } finally {
      unlinkSync(temporary);
    }
    // Every consumer verifies the archive manifest before replay. A losing writer
    // must not read a concurrent exclusive-copy fallback while it is still finishing.
  }
  return { base: BASE, fingerprint, path };
};
export const finish = (path, result, costs = {}) => {
  if (process.argv.includes('--check')) {
    const saved = read(path);
    const { source: savedSource, ...before } = saved.result;
    const { source: currentSource, ...after } = result;
    void currentSource;
    if (hash(before) !== hash(after)) throw Error('PR198 deterministic drift: ' + path);
    if (hash(read(savedSource.path).manifest) !== savedSource.fingerprint)
      throw Error('PR198 source archive drift');
  } else receipt(path, { result, costs });
};
